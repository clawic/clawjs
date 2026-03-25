import type { Message, PromptContextBlock } from "@clawjs/core";

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function renderContextBlocks(blocks: PromptContextBlock[] = []): string {
  return blocks
    .filter((block) => normalizeWhitespace(block.title) && normalizeWhitespace(block.content))
    .map((block) => `## ${normalizeWhitespace(block.title)}\n${block.content.trim()}`)
    .join("\n\n");
}

export function buildSystemPromptWithContext(systemPrompt?: string, contextBlocks: PromptContextBlock[] = []): string {
  const sections = [
    systemPrompt?.trim() || "",
    renderContextBlocks(contextBlocks),
  ].filter(Boolean);

  return sections.join("\n\n").trim();
}

export function formatOpenClawConversation(messages: Array<Pick<Message, "role" | "content" | "attachments" | "contextChips">>): string {
  return messages
    .map((message) => {
      const lines = [`${message.role.toUpperCase()}: ${message.content.trim()}`];
      if (message.contextChips?.length) {
        lines.push(`Context: ${message.contextChips.map((chip) => chip.label).join(", ")}`);
      }
      if (message.attachments?.length) {
        lines.push(`Attachments: ${message.attachments.map((attachment) => attachment.name).join(", ")}`);
      }
      return lines.join("\n");
    })
    .join("\n\n");
}

export function buildOpenClawCliPrompt(input: {
  systemPrompt?: string;
  contextBlocks?: PromptContextBlock[];
  messages: Array<Pick<Message, "role" | "content" | "attachments" | "contextChips">>;
}): string {
  const mergedSystemPrompt = buildSystemPromptWithContext(input.systemPrompt, input.contextBlocks);
  const sections = [
    mergedSystemPrompt ? `SYSTEM PROMPT:\n${mergedSystemPrompt}` : "",
    `CONVERSATION:\n${formatOpenClawConversation(input.messages)}`,
    "Reply only as the assistant to the current conversation.",
  ].filter(Boolean);

  return sections.join("\n\n").trim();
}

type OpenAIMessagePart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface OpenAIChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | OpenAIMessagePart[];
}

function toAttachmentDataUrl(message: Pick<Message, "attachments">): OpenAIMessagePart[] {
  return (message.attachments ?? [])
    .filter((attachment) => attachment.mimeType.startsWith("image/") && typeof attachment.data === "string" && attachment.data.trim())
    .map((attachment) => ({
      type: "image_url" as const,
      image_url: {
        url: attachment.data!.startsWith("data:")
          ? attachment.data!
          : `data:${attachment.mimeType};base64,${attachment.data!}`,
      },
    }));
}

export function buildOpenAIMessages(input: {
  systemPrompt?: string;
  contextBlocks?: PromptContextBlock[];
  messages: Array<Pick<Message, "role" | "content" | "attachments">>;
}): OpenAIChatMessage[] {
  const result: OpenAIChatMessage[] = [];
  const system = buildSystemPromptWithContext(input.systemPrompt, input.contextBlocks);
  if (system) {
    result.push({ role: "system", content: system });
  }

  for (const message of input.messages) {
    const imageParts = toAttachmentDataUrl(message);
    if (imageParts.length === 0) {
      result.push({
        role: message.role,
        content: message.content,
      });
      continue;
    }

    result.push({
      role: message.role,
      content: [
        { type: "text", text: message.content },
        ...imageParts,
      ],
    });
  }

  return result;
}
