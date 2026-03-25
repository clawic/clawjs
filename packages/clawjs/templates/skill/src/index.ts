import {
  type SkillMetadata,
  type __APP_PASCAL__Input,
  type __APP_PASCAL__Output,
  skillContract,
} from "./contract.js";

export const skillMetadata: SkillMetadata = {
  id: "__APP_SLUG__",
  name: "__APP_TITLE__",
  description: "Reusable skill scaffold for __APP_TITLE__.",
  version: "0.1.0",
};

export { skillContract };
export type SkillInput = __APP_PASCAL__Input;
export type SkillOutput = __APP_PASCAL__Output;

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1).trimEnd()}...`;
}

function inferPriority(input: __APP_PASCAL__Input): "low" | "medium" | "high" {
  const haystack = `${input.subject} ${input.context}`.toLowerCase();
  if (/(urgent|blocked|outage|incident|payment|security|tomorrow)/.test(haystack)) {
    return "high";
  }
  if (/(follow up|retry|review|question|customer)/.test(haystack)) {
    return "medium";
  }
  return "low";
}

export async function runSkill(input: __APP_PASCAL__Input): Promise<__APP_PASCAL__Output> {
  const priority = inferPriority(input);
  const subject = input.subject.trim() || "__APP_TITLE__ request";
  const contextSnippet = truncate(input.context.replace(/\s+/g, " ").trim(), 96);
  const requester = input.requester?.trim() || "the requester";

  return {
    summary: `${subject}: ${contextSnippet}`,
    priority,
    actions: [
      `Review the request from ${requester}.`,
      `Use this context as the starting point: ${contextSnippet}`,
      priority === "high"
        ? "Escalate quickly if the issue blocks a user-facing workflow."
        : "Reply with the next concrete step or missing detail.",
    ],
  };
}
