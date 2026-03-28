import { randomUUID } from "crypto";

import type { Message, PromptContextBlock, StreamChunk } from "@clawjs/core";

import type { CommandRunner, RuntimeConversationAdapter, ConversationGatewayDescriptor } from "../runtime/contracts.ts";
import { buildOpenAIMessages, buildOpenClawCliPrompt } from "./prompt.ts";
import { DEFAULT_SESSION_TITLE, suggestConversationTitle } from "./transcript.ts";
import { buildOpenClawCommand } from "../runtime/openclaw-command.ts";

export interface StreamConversationInput {
  sessionId: string;
  agentId?: string;
  systemPrompt?: string;
  contextBlocks?: PromptContextBlock[];
  messages: Array<Pick<Message, "role" | "content" | "attachments" | "contextChips">>;
  transport?: "auto" | "gateway" | "cli";
  model?: string;
  chunkSize?: number;
  gatewayRetries?: number;
  signal?: AbortSignal;
}

export interface StreamConversationDependencies {
  fetchImpl?: typeof fetch;
  runner?: CommandRunner;
  conversationAdapter?: RuntimeConversationAdapter;
  gatewayConfig?: {
    url: string;
    token?: string;
    port?: number;
    source?: string;
    configPath?: string;
  } | null;
}

export type ConversationStreamEvent =
  | { type: "transport"; sessionId: string; transport: "gateway" | "cli"; fallback: boolean }
  | { type: "retry"; sessionId: string; transport: "gateway"; attempt: number; maxAttempts: number; error: Error }
  | { type: "chunk"; chunk: StreamChunk }
  | { type: "done"; sessionId: string; messageId?: string }
  | { type: "title"; sessionId: string; title: string; source: "conversation" }
  | { type: "error"; sessionId: string; error: Error; transport: "gateway" | "cli"; partialText?: string }
  | { type: "aborted"; sessionId: string; reason?: string; partialText?: string };

function createAbortError(signal?: AbortSignal): Error {
  return new Error(signal?.reason ? `Conversation stream aborted: ${String(signal.reason)}` : "Conversation stream aborted");
}

function normalizeGatewayDescriptor(
  gatewayConfig?: StreamConversationDependencies["gatewayConfig"],
): ConversationGatewayDescriptor | null {
  if (!gatewayConfig?.url) return null;
  return {
    kind: "openai-chat-completions",
    url: gatewayConfig.url,
    ...(gatewayConfig.token ? { token: gatewayConfig.token } : {}),
  };
}

function createFallbackOpenClawConversationAdapter(
  input: StreamConversationInput,
  dependencies: StreamConversationDependencies,
): RuntimeConversationAdapter {
  const gateway = normalizeGatewayDescriptor(dependencies.gatewayConfig);

  return {
    transport: {
      kind: gateway ? "hybrid" : "cli",
      streaming: true,
      ...(gateway ? { gatewayKind: "openai-chat-completions" as const } : {}),
    },
    gateway,
    buildCliInvocation(cliInput) {
      if (!cliInput.agentId && !input.agentId) {
        throw new Error("agentId is required for OpenClaw CLI conversations");
      }
      const agentId = cliInput.agentId ?? input.agentId!;
      return {
        ...buildOpenClawCommand([
          "agent",
          "--agent",
          agentId,
          "--session-id",
          cliInput.sessionId,
          "--message",
          cliInput.prompt,
          "--thinking",
          "minimal",
          "--json",
          "--timeout",
          "120",
        ]),
        timeoutMs: 130_000,
        parser: "json-payloads",
      };
    },
    supportsGateway: true,
  };
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw createAbortError(signal);
  }
}

export function extractJsonPayloadText(stdout: string): string {
  const trimmed = stdout.trim();
  const candidates = [trimmed];

  for (const match of trimmed.matchAll(/(?:^|\n)\s*\{/g)) {
    const index = typeof match.index === "number" ? match.index + match[0].lastIndexOf("{") : -1;
    if (index > 0 && index < trimmed.length) {
      candidates.push(trimmed.slice(index));
    }
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as {
        payloads?: Array<{ text?: string | null }>;
        result?: {
          payloads?: Array<{ text?: string | null }>;
        };
      };
      const payloads = parsed.payloads ?? parsed.result?.payloads ?? [];
      const text = payloads.map((payload) => payload.text || "").join("").trim();
      if (text) {
        return text;
      }
    } catch {
      continue;
    }
  }

  throw new Error("Runtime CLI returned an invalid JSON payload");
}

export const extractOpenClawCliText = extractJsonPayloadText;

export function splitTextIntoChunks(text: string, chunkSize = 24): string[] {
  const normalized = text.trim();
  if (!normalized) return [];
  const chunks: string[] = [];
  for (let index = 0; index < normalized.length; index += chunkSize) {
    chunks.push(normalized.slice(index, index + chunkSize));
  }
  return chunks;
}

async function* executeGatewayTransport(
  input: StreamConversationInput,
  fetchImpl: typeof fetch,
  gatewayConfig: ConversationGatewayDescriptor,
  onRetry?: (error: Error, attempt: number, maxAttempts: number) => void,
): AsyncGenerator<StreamChunk> {
  const gatewayRetries = Math.max(0, input.gatewayRetries ?? 0);
  let lastGatewayError: Error | null = null;

  for (let attempt = 0; attempt <= gatewayRetries; attempt += 1) {
    try {
      yield* streamGatewayChunks(input, fetchImpl, gatewayConfig);
      return;
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      lastGatewayError = normalized;
      if (input.signal?.aborted) throw createAbortError(input.signal);
      if (attempt < gatewayRetries) {
        onRetry?.(normalized, attempt + 1, gatewayRetries + 1);
      }
    }
  }

  if (lastGatewayError) {
    throw lastGatewayError;
  }
}

async function* streamGatewayChunks(
  input: StreamConversationInput,
  fetchImpl: typeof fetch,
  gatewayConfig: ConversationGatewayDescriptor,
): AsyncGenerator<StreamChunk> {
  throwIfAborted(input.signal);
  if (gatewayConfig.kind !== "openai-chat-completions") {
    throw new Error(`Unsupported gateway transport: ${gatewayConfig.kind}`);
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (gatewayConfig.token) {
    headers.Authorization = `Bearer ${gatewayConfig.token}`;
  }

  const response = await fetchImpl(`${gatewayConfig.url}/v1/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: input.model || "default",
      messages: buildOpenAIMessages({
        systemPrompt: input.systemPrompt,
        contextBlocks: input.contextBlocks,
        messages: input.messages,
      }),
      stream: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Gateway HTTP ${response.status}: ${await response.text()}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Gateway HTTP returned no body");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  const messageId = randomUUID();

  while (true) {
    throwIfAborted(input.signal);
    const { done, value } = await reader.read();
    if (done) {
      yield {
        sessionId: input.sessionId,
        messageId,
        delta: "",
        done: true,
      };
      return;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data: ") || trimmed === "data: [DONE]") continue;
      try {
        const payload = JSON.parse(trimmed.slice(6)) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const text = payload.choices?.[0]?.delta?.content;
        if (text) {
          yield {
            sessionId: input.sessionId,
            messageId,
            delta: text,
            done: false,
          };
        }
      } catch {
        continue;
      }
    }
  }
}

async function* streamCliChunks(
  input: StreamConversationInput,
  runner: CommandRunner,
  conversationAdapter: RuntimeConversationAdapter,
): AsyncGenerator<StreamChunk> {
  throwIfAborted(input.signal);
  const prompt = buildOpenClawCliPrompt({
    systemPrompt: input.systemPrompt,
    contextBlocks: input.contextBlocks,
    messages: input.messages,
  });
  const invocation = conversationAdapter.buildCliInvocation({
    sessionId: input.sessionId,
    agentId: input.agentId,
    prompt,
    ...(input.model ? { model: input.model } : {}),
  });
  const result = await runner.exec(invocation.command, invocation.args, {
    env: invocation.env,
    timeoutMs: invocation.timeoutMs ?? 130_000,
  });

  const combinedOutput = [result.stdout, result.stderr].filter((value) => value && value.trim()).join("\n");
  const text = invocation.parser === "json-payloads"
    ? extractJsonPayloadText(combinedOutput)
    : result.stdout.trim();
  if (!text) {
    throw new Error("Runtime CLI returned no text");
  }

  const messageId = randomUUID();
  for (const chunk of splitTextIntoChunks(text, input.chunkSize ?? 24)) {
    yield {
      sessionId: input.sessionId,
      messageId,
      delta: chunk,
      done: false,
    };
  }

  yield {
    sessionId: input.sessionId,
    messageId,
    delta: "",
    done: true,
  };
}

export async function* streamRuntimeConversation(
  input: StreamConversationInput,
  dependencies: StreamConversationDependencies = {},
): AsyncGenerator<StreamChunk> {
  const transport = input.transport ?? "auto";
  const fetchImpl = dependencies.fetchImpl ?? globalThis.fetch;
  const conversationAdapter = dependencies.conversationAdapter ?? createFallbackOpenClawConversationAdapter(input, dependencies);
  const gatewayConfig = conversationAdapter?.gateway ?? null;

  if ((transport === "gateway" || transport === "auto") && gatewayConfig && fetchImpl) {
    try {
      yield* executeGatewayTransport(input, fetchImpl, gatewayConfig);
      return;
    } catch (error) {
      if (transport === "gateway") throw error;
      if (input.signal?.aborted) throw createAbortError(input.signal);
    }
  }

  if (!dependencies.runner) {
    throw new Error("runner is required for CLI conversation fallback");
  }
  if (!conversationAdapter) {
    throw new Error("conversationAdapter is required for CLI conversation fallback");
  }

  yield* streamCliChunks(input, dependencies.runner, conversationAdapter);
}

export const streamOpenClawConversation = streamRuntimeConversation;

export async function* streamRuntimeConversationEvents(
  input: StreamConversationInput,
  dependencies: StreamConversationDependencies = {},
): AsyncGenerator<ConversationStreamEvent> {
  const assistantMessages: Array<Pick<Message, "role" | "content">> = input.messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
  let streamedAssistantText = "";
  const requestedTransport = input.transport ?? "auto";
  const fetchImpl = dependencies.fetchImpl ?? globalThis.fetch;
  const conversationAdapter = dependencies.conversationAdapter ?? createFallbackOpenClawConversationAdapter(input, dependencies);
  const gatewayConfig = conversationAdapter?.gateway ?? null;
  const canUseGateway = !!(gatewayConfig && fetchImpl);
  const canUseCli = !!(dependencies.runner && conversationAdapter);
  const retryEvents: ConversationStreamEvent[] = [];

  if (input.signal?.aborted) {
    yield {
      type: "aborted",
      sessionId: input.sessionId,
      ...(input.signal.reason ? { reason: String(input.signal.reason) } : {}),
    };
    return;
  }

  function flushRetries(): ConversationStreamEvent[] {
    const events = [...retryEvents];
    retryEvents.length = 0;
    return events;
  }

  function buildCompletionEvents(chunk: StreamChunk): ConversationStreamEvent[] {
    const events: ConversationStreamEvent[] = [
      { type: "done", sessionId: chunk.sessionId, ...(chunk.messageId ? { messageId: chunk.messageId } : {}) },
    ];
    const title = suggestConversationTitle([
      ...assistantMessages,
      ...(streamedAssistantText.trim()
        ? [{
            role: "assistant" as const,
            content: streamedAssistantText.trim(),
          }]
        : []),
    ]);
    if (title !== DEFAULT_SESSION_TITLE) {
      events.push({
        type: "title",
        sessionId: input.sessionId,
        title,
        source: "conversation",
      });
    }
    return events;
  }

  try {
    if (requestedTransport === "gateway") {
      if (!canUseGateway) {
        throw new Error("gatewayConfig is required for gateway conversation streaming");
      }
      yield { type: "transport", sessionId: input.sessionId, transport: "gateway", fallback: false };
      for await (const chunk of executeGatewayTransport(input, fetchImpl!, gatewayConfig!, (error, attempt, maxAttempts) => {
        retryEvents.push({
          type: "retry",
          sessionId: input.sessionId,
          transport: "gateway",
          attempt,
          maxAttempts,
          error,
        });
      })) {
        for (const retryEvent of flushRetries()) {
          yield retryEvent;
        }
        if (!chunk.done) {
          streamedAssistantText += chunk.delta;
          yield { type: "chunk", chunk };
          continue;
        }
        for (const event of buildCompletionEvents(chunk)) {
          yield event;
        }
      }
      for (const retryEvent of flushRetries()) {
        yield retryEvent;
      }
      return;
    }

    if (requestedTransport === "cli") {
      if (!canUseCli) {
        throw new Error("runner is required for CLI conversation fallback");
      }
      yield { type: "transport", sessionId: input.sessionId, transport: "cli", fallback: false };
      for await (const chunk of streamCliChunks(input, dependencies.runner!, conversationAdapter!)) {
        if (!chunk.done) {
          streamedAssistantText += chunk.delta;
          yield { type: "chunk", chunk };
          continue;
        }
        for (const event of buildCompletionEvents(chunk)) {
          yield event;
        }
      }
      return;
    }

    if (canUseGateway) {
      yield { type: "transport", sessionId: input.sessionId, transport: "gateway", fallback: false };
      try {
        for await (const chunk of executeGatewayTransport(input, fetchImpl!, gatewayConfig!, (error, attempt, maxAttempts) => {
          retryEvents.push({
            type: "retry",
            sessionId: input.sessionId,
            transport: "gateway",
            attempt,
            maxAttempts,
            error,
          });
        })) {
          for (const retryEvent of flushRetries()) {
            yield retryEvent;
          }
          if (!chunk.done) {
            streamedAssistantText += chunk.delta;
            yield { type: "chunk", chunk };
            continue;
          }
          for (const event of buildCompletionEvents(chunk)) {
            yield event;
          }
        }
        for (const retryEvent of flushRetries()) {
          yield retryEvent;
        }
        return;
      } catch (error) {
        for (const retryEvent of flushRetries()) {
          yield retryEvent;
        }
        if (input.signal?.aborted) {
          throw createAbortError(input.signal);
        }
        if (!canUseCli) {
          throw error;
        }
      }
    }

    if (!canUseCli) {
      throw new Error("runner is required for CLI conversation fallback");
    }

    yield { type: "transport", sessionId: input.sessionId, transport: "cli", fallback: canUseGateway };
    for await (const chunk of streamCliChunks(input, dependencies.runner!, conversationAdapter!)) {
      if (!chunk.done) {
        streamedAssistantText += chunk.delta;
        yield { type: "chunk", chunk };
        continue;
      }
      for (const event of buildCompletionEvents(chunk)) {
        yield event;
      }
    }
  } catch (error) {
    for (const retryEvent of flushRetries()) {
      yield retryEvent;
    }
    if (input.signal?.aborted) {
      yield {
        type: "aborted",
        sessionId: input.sessionId,
        ...(input.signal.reason ? { reason: String(input.signal.reason) } : {}),
        ...(streamedAssistantText.trim() ? { partialText: streamedAssistantText } : {}),
      };
      return;
    }

    const normalized = error instanceof Error ? error : new Error(String(error));
    yield {
      type: "error",
      sessionId: input.sessionId,
      error: normalized,
      transport: requestedTransport === "cli" ? "cli" : canUseGateway ? "gateway" : "cli",
      ...(streamedAssistantText.trim() ? { partialText: streamedAssistantText } : {}),
    };
  }
}

export const streamOpenClawConversationEvents = streamRuntimeConversationEvents;
