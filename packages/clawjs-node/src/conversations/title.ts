import type { Message } from "@clawjs/core";

import { summarizeTitle } from "./transcript.ts";
import type { CommandRunner, ConversationGatewayDescriptor, RuntimeConversationAdapter } from "../runtime/contracts.ts";
import { extractJsonPayloadText } from "./stream.ts";
import { buildOpenClawCommand } from "../runtime/openclaw-command.ts";

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function buildTitleConversationSnippet(messages: Array<Pick<Message, "role" | "content">>, maxMessages = 6): string {
  return messages
    .slice(0, maxMessages)
    .map((message) => `${message.role.toUpperCase()}: ${normalizeText(message.content)}`)
    .join("\n");
}

export function buildTitlePrompt(messages: Array<Pick<Message, "role" | "content">>): string {
  const snippet = buildTitleConversationSnippet(messages);
  return [
    "Generate a concise conversation title.",
    "Return only the title, with no quotes, markdown, or explanation.",
    "Use 2 to 6 words when possible.",
    `CONVERSATION:\n${snippet}`,
  ].join("\n\n");
}

async function generateTitleViaGateway(
  messages: Array<Pick<Message, "role" | "content">>,
  gatewayConfig: ConversationGatewayDescriptor,
  fetchImpl: typeof fetch,
): Promise<string> {
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
      model: "default",
      messages: [
        {
          role: "user",
          content: buildTitlePrompt(messages),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Gateway HTTP ${response.status}: ${await response.text()}`);
  }

  const payload = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return summarizeTitle(payload.choices?.[0]?.message?.content || "");
}

async function generateTitleViaCli(
  messages: Array<Pick<Message, "role" | "content">>,
  conversationAdapter: RuntimeConversationAdapter,
  runner: CommandRunner,
  agentId?: string,
): Promise<string> {
  const invocation = conversationAdapter.buildCliInvocation({
    sessionId: "title-preview",
    agentId,
    prompt: buildTitlePrompt(messages),
  });
  const result = await runner.exec(invocation.command, invocation.args, {
    env: invocation.env,
    timeoutMs: invocation.timeoutMs ?? 65_000,
  });

  const combinedOutput = [result.stdout, result.stderr].filter((value) => value && value.trim()).join("\n");
  const text = invocation.parser === "json-payloads"
    ? extractJsonPayloadText(combinedOutput)
    : result.stdout.trim();
  return summarizeTitle(text);
}

export async function generateRuntimeConversationTitle(input: {
  messages: Array<Pick<Message, "role" | "content">>;
  agentId?: string;
  conversationAdapter?: RuntimeConversationAdapter;
  gatewayConfig?: {
    url: string;
    token?: string;
    port?: number;
    source?: string;
    configPath?: string;
  } | null;
  fetchImpl?: typeof fetch;
  runner?: CommandRunner;
}): Promise<string> {
  const meaningfulMessages = input.messages.filter((message) => normalizeText(message.content).length > 0);
  if (meaningfulMessages.length === 0) {
    return summarizeTitle("");
  }

  const gateway = input.conversationAdapter?.gateway ?? (input.gatewayConfig?.url
    ? {
        kind: "openai-chat-completions" as const,
        url: input.gatewayConfig.url,
        ...(input.gatewayConfig.token ? { token: input.gatewayConfig.token } : {}),
      }
    : null);
  const conversationAdapter = input.conversationAdapter ?? (input.agentId || gateway
    ? {
        transport: {
          kind: gateway ? "hybrid" : "cli",
          streaming: false,
          ...(gateway ? { gatewayKind: "openai-chat-completions" as const } : {}),
        },
        gateway,
        buildCliInvocation(cliInput) {
          if (!cliInput.agentId) {
            throw new Error("agentId is required for OpenClaw CLI title generation");
          }
          return {
            ...buildOpenClawCommand([
              "agent",
              "--agent",
              cliInput.agentId,
              "--message",
              cliInput.prompt,
              "--thinking",
              "minimal",
              "--json",
              "--timeout",
              "60",
            ]),
            timeoutMs: 65_000,
            parser: "json-payloads" as const,
          };
        },
      }
    : undefined);

  if (conversationAdapter?.gateway && input.fetchImpl) {
    try {
      return await generateTitleViaGateway(meaningfulMessages, conversationAdapter.gateway, input.fetchImpl);
    } catch {
      // fall through to CLI
    }
  }

  if (conversationAdapter && input.runner) {
    return generateTitleViaCli(meaningfulMessages, conversationAdapter, input.runner, input.agentId);
  }

  return summarizeTitle(meaningfulMessages.find((message) => message.role === "user")?.content || meaningfulMessages[0]?.content || "");
}

export const generateConversationTitle = generateRuntimeConversationTitle;
