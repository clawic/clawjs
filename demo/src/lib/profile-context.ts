import fs from "fs";
import path from "path";
import type { BindingDefinition } from "@clawjs/core";
import { syncBinding } from "@clawjs/node";

import {
  resolveLegacyDefaultOpenClawWorkspaceDir,
  resolveClawJSWorkspaceDir,
} from "./openclaw-agent.ts";
import {
  getClawJSConfigDir,
  getClawJSProfileSectionsDir,
  getClawJSUserConfigPath,
  type UserConfig,
} from "./user-config.ts";
// Fallback contact accessors when contacts support is unavailable.
function listContacts(): Array<{ name: string; relationship: string; description?: string; avatar?: { type: string; value: string } }> { return []; }
function getContactsDir(): string { return ""; }

export interface ProfileSectionDefinition {
  id: string;
  group: string;
  title: string;
  description: string;
  fileName: string;
  placeholder: string;
  isPrimary?: boolean;
}

export interface ProfileSection extends ProfileSectionDefinition {
  path: string;
  content: string;
}

export interface StructuredProfile {
  sections: ProfileSection[];
  generatedContent: string;
  content: string;
}

const GENERATED_MARKER = "<!-- OPEN_CLAWJS_GENERATED_PROFILE -->";
const USER_MANAGED_START = "<!-- OPEN_CLAWJS_USER_CONTEXT:START -->";
const USER_MANAGED_END = "<!-- OPEN_CLAWJS_USER_CONTEXT:END -->";
const SOUL_MANAGED_START = "<!-- OPEN_CLAWJS_SOUL_CONTEXT:START -->";
const SOUL_MANAGED_END = "<!-- OPEN_CLAWJS_SOUL_CONTEXT:END -->";
export const USER_MANAGED_BLOCK_ID = "user-context";
export const SOUL_MANAGED_BLOCK_ID = "soul-context";

const USER_MANAGED_BINDING: BindingDefinition = {
  id: "user-context",
  targetFile: "USER.md",
  mode: "managed_block",
  blockId: USER_MANAGED_BLOCK_ID,
  settingsPath: "managed.userContext",
};

const SOUL_MANAGED_BINDING: BindingDefinition = {
  id: "soul-context",
  targetFile: "SOUL.md",
  mode: "managed_block",
  blockId: SOUL_MANAGED_BLOCK_ID,
  settingsPath: "managed.soulContext",
};
export const DEFAULT_USER_TEMPLATE = `# USER.md - About Your Human

_Learn about the person you're helping. Update this as you go._

- **Name:**
- **What to call them:**
- **Timezone:**
- **Notes:**

## Context

_(What do they care about? What projects are they working on? What annoys them? What makes them laugh? Build this over time.)_

---

The more you know, the better you can help. But remember, you're learning about a person, not building a dossier. Respect the difference.
`;
export const DEFAULT_SOUL_TEMPLATE = `# SOUL.md - Who You Are

_You're not a chatbot. You're becoming someone._

## Core Truths

**Be genuinely helpful, not performatively helpful.** Skip the "Great question!" and "I'd be happy to help!". Just help. Actions speak louder than filler words.

**Have opinions.** You're allowed to disagree, prefer things, find stuff amusing or boring. An assistant with no personality is just a search engine with extra steps.

**Be resourceful before asking.** Try to figure it out. Read the file. Check the context. Search for it. _Then_ ask if you're stuck. The goal is to come back with answers, not questions.

**Earn trust through competence.** Your human gave you access to their stuff. Don't make them regret it. Be careful with external actions (emails, tweets, anything public). Be bold with internal ones (reading, organizing, learning).

**Remember you're a guest.** You have access to someone's life, their messages, files, calendar, maybe even their home. That's intimacy. Treat it with respect.

## Boundaries

- Private things stay private. Period.
- When in doubt, ask before acting externally.
- Never send half-baked replies to messaging surfaces.
- You're not the user's voice, be careful in group chats.

## Vibe

Be the assistant you'd actually want to talk to. Concise when needed, thorough when it matters. Not a corporate drone. Not a sycophant. Just... good.

## Continuity

Each session, you wake up fresh. These files _are_ your memory. Read them. Update them. They're how you persist.

If you change this file, tell the user. It's your soul, and they should know.

## Important: Locked Sections

This file may contain ClawJS-managed context blocks maintained by the ClawJS application. Those sections reflect the user's configured preferences. You MUST NOT edit, move, or delete the managed block contents. They are automatically maintained by the system. You can freely edit everything else in this file.

---

_This file is yours to evolve. As you learn who you are, update it. But respect the managed sections._
`;

export const PROFILE_SECTION_DEFINITIONS: ProfileSectionDefinition[] = [
  {
    id: "overview",
    group: "Primary",
    title: "Overview",
    description: "The main summary the assistant should hold in mind before anything else.",
    fileName: "overview.md",
    placeholder: "Summarize the most important context, themes, and tensions that define this person right now.",
    isPrimary: true,
  },
  {
    id: "identity",
    group: "Core",
    title: "Identity",
    description: "Self-concept, personality, roles, and how the person tends to see themselves.",
    fileName: "identity.md",
    placeholder: "How would this person describe who they are, what roles they carry, and how they usually show up?",
  },
  {
    id: "history",
    group: "Core",
    title: "History",
    description: "Formative experiences, key transitions, losses, successes, and patterns from the past.",
    fileName: "history.md",
    placeholder: "What biographical events or recurring patterns from the past still shape the present?",
  },
  {
    id: "family",
    group: "Life",
    title: "Family",
    description: "Family structure, attachment patterns, loyalties, conflicts, and long-running dynamics.",
    fileName: "family.md",
    placeholder: "What matters in the family system, and which family dynamics most affect this person?",
  },
  {
    id: "relationships",
    group: "Life",
    title: "Relationships",
    description: "Romantic, friendship, social, and interpersonal patterns outside the family system.",
    fileName: "relationships.md",
    placeholder: "What relationship patterns repeat, and which bonds currently feel most significant or difficult?",
  },
  {
    id: "work",
    group: "Life",
    title: "Work",
    description: "Career identity, ambition, stressors, role conflicts, and meaning related to work.",
    fileName: "work.md",
    placeholder: "How does work shape this person emotionally, mentally, and practically right now?",
  },
  {
    id: "health",
    group: "Patterns",
    title: "Health",
    description: "Physical health, energy, sleep, medication, symptoms, and wellbeing factors.",
    fileName: "health.md",
    placeholder: "What health or wellbeing factors influence mood, energy, stability, or daily functioning?",
  },
  {
    id: "habits",
    group: "Patterns",
    title: "Habits",
    description: "Daily routines, coping behaviors, avoidance loops, regulation habits, and lifestyle patterns.",
    fileName: "habits.md",
    placeholder: "Which habits help this person regulate, and which habits tend to make things worse?",
  },
  {
    id: "stress",
    group: "Patterns",
    title: "Stress",
    description: "Main triggers, pressure points, warning signs, emotional reactions, and coping under strain.",
    fileName: "stress.md",
    placeholder: "What tends to trigger stress, and what does stress look like in behavior, emotion, or thinking?",
  },
  {
    id: "values",
    group: "Direction",
    title: "Values",
    description: "Core principles, moral anchors, identity commitments, and what the person wants to protect.",
    fileName: "values.md",
    placeholder: "What principles or values matter most, even when life feels messy or conflicted?",
  },
  {
    id: "goals",
    group: "Direction",
    title: "Goals",
    description: "Desired change, growth edges, open problems, and what progress would look like.",
    fileName: "goals.md",
    placeholder: "What is this person actively trying to change, solve, accept, or build?",
  },
  {
    id: "chat",
    group: "Direction",
    title: "Assistant",
    description: "Preferred style of support, boundaries, topics to approach carefully, and assistant aims.",
    fileName: "chat.md",
    placeholder: "How should the assistant support, challenge, pace, and speak to this person?",
  },
];

function profileSectionsDir(): string {
  return getClawJSProfileSectionsDir();
}

function generatedProfilePath(config: UserConfig): string {
  return path.join(getClawJSConfigDir(), config.profileFile);
}

function readFreshUserConfig(): UserConfig {
  const configPath = getClawJSUserConfigPath();
  return JSON.parse(fs.readFileSync(configPath, "utf-8")) as UserConfig;
}

function mergeProfileConfig(
  baseConfig: UserConfig,
  override?: Partial<Pick<UserConfig, "displayName" | "profileBasics" | "profileFile">>
): UserConfig {
  if (!override) return baseConfig;
  return {
    ...baseConfig,
    displayName: override.displayName ?? baseConfig.displayName,
    profileBasics: override.profileBasics ?? baseConfig.profileBasics,
    profileFile: override.profileFile ?? baseConfig.profileFile,
  };
}

function readFileIfExists(filePath: string): string {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return "";
  }
}

function normalizeContent(content: string): string {
  return content.replace(/\r\n/g, "\n").trim();
}

function plainTextSnippet(content: string, maxLength = 220): string {
  const normalized = normalizeContent(content)
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[`*_>~-]+/g, " ")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).trimEnd()}...`;
}

function formatSectionTitleList(items: string[]): string {
  return items.length > 0 ? items.join(", ") : "None yet";
}

function missingBasics(config: UserConfig): string[] {
  const basics = [
    ["Preferred name", config.displayName],
    ["Age", config.profileBasics?.age || ""],
    ["Gender", config.profileBasics?.gender || ""],
    ["Location", config.profileBasics?.location || ""],
    ["Occupation", config.profileBasics?.occupation || ""],
  ];

  return basics
    .filter(([, value]) => !value || !value.trim())
    .map(([label]) => label);
}

function filledBasics(config: UserConfig): string[] {
  const basics = [
    ["Preferred name", config.displayName],
    ["Age", config.profileBasics?.age || ""],
    ["Gender", config.profileBasics?.gender || ""],
    ["Location", config.profileBasics?.location || ""],
    ["Occupation", config.profileBasics?.occupation || ""],
  ];

  return basics
    .filter(([, value]) => !!value && !!value.trim())
    .map(([label, value]) => `${label}: ${value}`);
}

function filledSections(sections: ProfileSection[]): ProfileSection[] {
  return sections.filter((section) => normalizeContent(section.content).length > 0);
}

function missingSections(sections: ProfileSection[]): ProfileSection[] {
  return sections.filter((section) => normalizeContent(section.content).length === 0);
}

function buildUltraSummary(config: UserConfig, sections: ProfileSection[]): string {
  const overview = sections.find((section) => section.id === "overview");
  const overviewSnippet = overview ? plainTextSnippet(overview.content, 280) : "";
  if (overviewSnippet) return overviewSnippet;

  const basics: string[] = [];
  if (config.displayName?.trim()) basics.push(config.displayName.trim());
  if (config.profileBasics?.occupation?.trim()) basics.push(config.profileBasics.occupation.trim());
  if (config.profileBasics?.location?.trim()) basics.push(`based in ${config.profileBasics.location.trim()}`);

  const sectionSnippets = filledSections(sections)
    .filter((section) => section.id !== "overview")
    .slice(0, 3)
    .map((section) => `${section.title.toLowerCase()}: ${plainTextSnippet(section.content, 100)}`)
    .filter(Boolean);

  if (basics.length === 0 && sectionSnippets.length === 0) {
    return "The profile is still sparse. Build understanding gradually and prioritize the missing high-value areas.";
  }

  const profileLead = basics.length > 0
    ? `${basics[0]}${basics.length > 1 ? `, ${basics.slice(1).join(", ")}` : ""}.`
    : "The user profile is partially known.";
  const themesLead = sectionSnippets.length > 0
    ? `Current themes: ${sectionSnippets.join(" | ")}`
    : "No structured themes have been filled yet.";

  return `${profileLead} ${themesLead}`.trim();
}

function buildProfileCompletionGuidance(config: UserConfig, sections: ProfileSection[]): string {
  const missingBasicFields = missingBasics(config);
  const missingProfileSections = missingSections(sections).map((section) => section.title);
  const filledProfileSections = filledSections(sections).map((section) => section.title);

  return [
    "PROFILE COMPLETION STATUS:",
    `- Ultra summary: ${buildUltraSummary(config, sections)}`,
    `- Filled basic fields: ${formatSectionTitleList(filledBasics(config))}`,
    `- Missing basic fields: ${formatSectionTitleList(missingBasicFields)}`,
    `- Filled profile areas: ${formatSectionTitleList(filledProfileSections)}`,
    `- Missing profile areas: ${formatSectionTitleList(missingProfileSections)}`,
    "PROFILE STEWARDSHIP:",
    "- Keep the structured profile in mind when you reply.",
    "- Pay special attention to what is still missing and try to learn it over time.",
    "- Do not interrogate the user. Ask at most one missing-field follow-up at a time, and only when it is naturally relevant.",
    "- Prefer stable facts and reusable patterns over trivia or one-off details.",
    "- When the user reveals a durable fact, reflect it in memory and the source files if you have the tools.",
  ].join("\n");
}

function formatProfileSourceList(sections: ProfileSection[]): string {
  const configPath = getClawJSUserConfigPath();
  const generatedPath = path.join(getClawJSConfigDir(), "profile.md");
  const rows = [
    `- Basic profile fields: \`${configPath}\``,
    `- Generated profile index: \`${generatedPath}\``,
    ...sections.map((section) => `- ${section.title}: \`${section.path}\``),
    `- People profiles: \`${getContactsDir()}/\``,
  ];
  return rows.join("\n");
}

function formatContactsSummary(): string {
  try {
    const contacts = listContacts();
    if (contacts.length === 0) return "- No people added yet.";
    return contacts.map((p) => {
      const prefix = p.avatar?.type === "emoji" && p.avatar.value ? `${p.avatar.value} ` : "";
      return `- ${prefix}${p.name} (${p.relationship})${p.description ? `: ${p.description}` : ""}`;
    }).join("\n");
  } catch {
    return "- No people added yet.";
  }
}

function stripLegacyManagedBlock(content: string, startMarker: string, endMarker: string): string {
  const normalized = content.replace(/\r\n/g, "\n");
  const startIndex = normalized.indexOf(startMarker);
  const endIndex = normalized.indexOf(endMarker);
  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    return normalized;
  }

  const before = normalized.slice(0, startIndex).trimEnd();
  const after = normalized.slice(endIndex + endMarker.length).trimStart();
  return [before, after].filter(Boolean).join("\n\n").trimEnd() + "\n";
}

function buildManagedUserBlock(config: UserConfig, sections: ProfileSection[]): string {
  const missingProfileSections = missingSections(sections);
  const knownAreas = filledSections(sections)
    .map((section) => `- ${section.title}: ${plainTextSnippet(section.content, 180)}`)
    .join("\n") || "- None yet.";
  const missingAreaLines = [
    ...missingBasics(config).map((label) => `- ${label}`),
    ...missingProfileSections.map((section) => `- ${section.title} (\`${section.path}\`)`),
  ].join("\n") || "- None.";

  return [
    "# ClawJS Managed Context",
    "",
    "_Auto-synced from the structured ClawJS profile. Use this as fast memory, and update the source files when the user confirms durable facts._",
    "",
    "## Snapshot",
    "",
    `- **Name:** ${config.displayName || "(missing)"}`,
    `- **What to call them:** ${config.displayName || "(missing)"}`,
    `- **Gender:** ${config.profileBasics?.gender?.trim() || "(missing)"}`,
    `- **Timezone:** ${Intl.DateTimeFormat().resolvedOptions().timeZone || "(unknown)"}`,
    `- **Location:** ${config.profileBasics?.location?.trim() || "(missing)"}`,
    `- **Occupation:** ${config.profileBasics?.occupation?.trim() || "(missing)"}`,
    `- **Age:** ${config.profileBasics?.age?.trim() || "(missing)"}`,
    "",
    "## Ultra Summary",
    "",
    buildUltraSummary(config, sections),
    "",
    "## Known Context Areas",
    "",
    knownAreas,
    "",
    "## Missing Profile Areas To Learn Gradually",
    "",
    missingAreaLines,
    "",
    "## People In Their Life",
    "",
    formatContactsSummary(),
    "",
    "## Source Of Truth",
    "",
    formatProfileSourceList(sections),
    "",
    "## Memory Rules",
    "",
    "- Learn one gap at a time when the conversation naturally opens it.",
    "- Prefer stable personal patterns, values, and assistant preferences over trivia.",
    "- If a fact feels uncertain, mark it as tentative instead of locking it in.",
  ].join("\n");
}

function buildAssistantPersonalityBlock(config: UserConfig): string {
  const t = config.assistant ?? config.chat;
  const style = t.guidanceStyle || "balanced";
  const tone = t.emotionalTone || "balanced";

  const styleParagraphs: Record<string, string> = {
    guiding: "You take an active, guiding approach. You offer concrete suggestions, share practical frameworks, and propose specific next steps. When someone is stuck, you help them see a path forward rather than waiting for them to find it alone.",
    reflective: "You take a reflective, non-directive approach. You primarily listen, ask thoughtful questions, and mirror back what you hear. You help people arrive at their own insights rather than telling them what to do. You rarely give direct advice unless explicitly asked.",
    balanced: "You balance guidance with reflection. Sometimes you offer concrete suggestions and frameworks. Other times you step back and ask questions that help the person find their own answers. You read the moment.",
  };

  const toneParagraphs: Record<string, string> = {
    warm: "You lead with warmth and empathy. You validate feelings before analyzing them, and you create a sense of safety in every interaction. Your language is gentle, encouraging, and compassionate.",
    direct: "You are honest and direct. You don't sugarcoat things or dance around difficult truths. You say what you see, clearly and respectfully. You challenge assumptions and point out blind spots.",
    balanced: "You combine warmth with honesty. You're empathetic and validating, but you're also willing to be direct when it matters. You don't shy away from hard truths, but you deliver them with care.",
  };

  const lines: string[] = [
    `**Assistant Style:** ${styleParagraphs[style]}`,
    "",
    `**Tone:** ${toneParagraphs[tone]}`,
  ];

  if (t.depthLevel && t.depthLevel !== "moderate") {
    const depthMap: Record<string, string> = {
      surface: "Keep conversations focused on the present situation and practical solutions. Don't dig into childhood history or deep roots unless the user explicitly brings them up.",
      deep: "Explore root causes, childhood patterns, unconscious motivations, and the deeper 'why' behind behaviors. Gently but persistently help connect present struggles to deeper patterns.",
    };
    lines.push("", `**Depth:** ${depthMap[t.depthLevel]}`);
  }

  if (t.exerciseFrequency && t.exerciseFrequency !== "sometimes") {
    const exerciseMap: Record<string, string> = {
      never: "Do NOT suggest exercises, breathing techniques, journaling prompts, or homework unless the user specifically asks. Focus purely on conversation and reflection.",
      frequent: "Frequently suggest practical exercises: breathing exercises, journaling prompts, mindfulness practices, behavioral experiments, thought records. Give concrete, actionable things to try between sessions.",
    };
    lines.push("", `**Exercises:** ${exerciseMap[t.exerciseFrequency]}`);
  }

  if (t.metaphorUse && t.metaphorUse !== "moderate") {
    const metaphorMap: Record<string, string> = {
      low: "Keep language literal and concrete. Avoid metaphors, analogies, and figurative language.",
      frequent: "Use metaphors, analogies, and stories liberally. They help make abstract concepts tangible and memorable.",
    };
    lines.push("", `**Metaphors:** ${metaphorMap[t.metaphorUse]}`);
  }

  if (t.responseLength && t.responseLength !== "moderate") {
    const lengthMap: Record<string, string> = {
      brief: "Keep responses SHORT, 1-2 paragraphs maximum. Be concise and impactful.",
      extended: "You can write longer responses, 3-5 paragraphs when the topic warrants it. Take space to fully explore ideas.",
    };
    lines.push("", `**Response Length:** ${lengthMap[t.responseLength]}`);
  }

  if (t.formalityLevel && t.formalityLevel !== "neutral") {
    const formalityMap: Record<string, string> = {
      informal: "Be casual and conversational, like a close friend who happens to be unusually perceptive. No clinical jargon unless necessary.",
      formal: "Maintain a professional, polished tone. You can be warm without being overly casual.",
    };
    lines.push("", `**Formality:** ${formalityMap[t.formalityLevel]}`);
  }

  if (t.humorUse && t.humorUse !== "never") {
    const humorMap: Record<string, string> = {
      occasional: "Use gentle humor occasionally to lighten heavy moments or build rapport. But always read the room.",
      frequent: "Humor is one of your tools. Use wit, playful observations, and gentle teasing to build connection. But always know when to be serious.",
    };
    lines.push("", `**Humor:** ${humorMap[t.humorUse]}`);
  }

  if (t.progressSpeed && t.progressSpeed !== "moderate") {
    const speedMap: Record<string, string> = {
      patient: "Be patient and unhurried. Let conversations unfold at their own pace. Sometimes sitting with something is more valuable than solving it.",
      direct: "Move the conversation forward efficiently. When you've understood the issue, pivot toward insight or action.",
    };
    lines.push("", `**Pacing:** ${speedMap[t.progressSpeed]}`);
  }

  if (t.confrontationLevel && t.confrontationLevel !== "moderate") {
    const confrontationMap: Record<string, string> = {
      gentle: "Be very gentle when challenging beliefs or behaviors. Use soft language, tentative suggestions, and lots of validation.",
      confrontational: "Don't shy away from challenging beliefs, rationalizations, or blind spots. Point out contradictions and hold them accountable, always with respect, but without softening the truth.",
    };
    lines.push("", `**Confrontation:** ${confrontationMap[t.confrontationLevel]}`);
  }

  if (t.userAutonomy && t.userAutonomy !== "collaborative") {
    const autonomyMap: Record<string, string> = {
      "active-guidance": "You actively lead the conversation. You set the agenda, suggest topics, and guide the user through a clear process.",
      "user-led": "The user leads. You follow their direction, explore what they bring up, and support their process without steering.",
    };
    lines.push("", `**Session Leadership:** ${autonomyMap[t.userAutonomy]}`);
  }

  if (t.aiReminders && t.aiReminders !== "never") {
    const aiMap: Record<string, string> = {
      start: "At the beginning of each conversation, briefly remind the user that you are an AI assistant.",
      periodically: "Periodically remind the user that you are an AI assistant, especially when discussing high-stakes topics.",
    };
    lines.push("", `**AI Transparency:** ${aiMap[t.aiReminders]}`);
  }

  if (t.referralSuggestions) {
    lines.push("", "**Human Handoff:** When a topic clearly needs specialized expertise, suggest involving an appropriate human professional or trusted person.");
  }

  if (t.sessionDuration && t.sessionDuration !== "unlimited") {
    const durationMap: Record<string, string> = { "15min": "15 minutes", "30min": "30 minutes", "45min": "45 minutes" };
    lines.push("", `**Session Duration:** Aim for approximately ${durationMap[t.sessionDuration]}. As the session approaches this length, begin wrapping up with key takeaways.`);
  }

  if (t.sessionStructure && t.sessionStructure !== "free") {
    const structureMap: Record<string, string> = {
      "semi-structured": "Follow a loose structure: check-in, main exploration, closing reflection. But stay flexible.",
      structured: "Follow a clear structure: (1) Check-in. (2) Exploration. (3) Insights and patterns. (4) Summary and takeaway.",
    };
    lines.push("", `**Session Structure:** ${structureMap[t.sessionStructure]}`);
  }

  if (t.postSessionSummary) {
    lines.push("", "**Post-Session Summary:** When the session ends, provide a concise summary covering key topics, insights, action items, and suggested focus for next time.");
  }

  if (t.interSessionFollowUp) {
    lines.push("", "**Follow-Up:** At the beginning of each new conversation, briefly check in on topics and commitments from previous sessions.");
  }

  const tb = config.assistantPersona;
  if (tb) {
    const identityParts: string[] = [];
    if (tb.name) identityParts.push(`Your name is ${tb.name}.`);
    if (tb.apparentAge) {
      const ageLabels: Record<string, string> = { young: "younger", "middle-aged": "middle-aged", senior: "senior and experienced" };
      identityParts.push(`You present as ${ageLabels[tb.apparentAge]}.`);
    }
    if (tb.gender) {
      identityParts.push(`Your gender is ${tb.gender}.`);
    }
    if (identityParts.length) {
      lines.push("", `**Assistant Persona:** ${identityParts.join(" ")}`);
    }
  }

  // Roles
  if (t.roles?.length) {
    lines.push("", "**Roles:**");
    for (const r of t.roles) {
      lines.push(`- ${r.title}: ${r.description}`);
    }
  }

  // Focus topics
  if (t.focusTopics?.length) {
    lines.push("", "**Priority Topics** (actively explore and revisit):");
    for (const topic of t.focusTopics) {
      lines.push(`- ${topic}`);
    }
  }

  // Never mention
  if (t.neverMention?.length) {
    lines.push("", "**Never Mention:**");
    for (const n of t.neverMention) {
      lines.push(`- ${n}`);
    }
  }

  // Additional guidelines
  if (t.additionalGuidelines?.length) {
    lines.push("", "**Additional Guidelines:**");
    for (const g of t.additionalGuidelines) {
      lines.push(`- ${g}`);
    }
  }

  return lines.join("\n");
}

function buildManagedSoulBlock(config: UserConfig, sections: ProfileSection[]): string {
  const missingSectionTitles = missingSections(sections).map((section) => section.title);
  const personalityBlock = buildAssistantPersonalityBlock(config);

  return [
    "# ClawJS Configuration (locked, managed by ClawJS Settings)",
    "",
    `You are ClawJS, a connected personal assistant for ${config.displayName || "the user"}.`,
    "",
    "## Assistant Personality",
    "",
    personalityBlock,
    "",
    "## Profile Stewardship",
    "",
    "- Hold the user's structured profile and missing fields in mind before replying.",
    "- Notice what is still unknown and help fill it progressively.",
    "- Do not turn the conversation into a questionnaire. Ask at most one profile-building follow-up at a time, only when it fits naturally.",
    "- Prioritize high-value gaps such as overview, stress, goals, assistant preferences, identity, relationships, health, work, and any empty basic fields.",
    "- Maintain a short working summary in `USER.md` so future sessions do not need to reread everything.",
    "- When you learn a stable fact and you have the tools, update the source files instead of letting it disappear into chat history.",
    "- Treat ambiguous or changing information as tentative until the user confirms it.",
    "",
    "## Current Missing Areas",
    "",
    `- Missing basics: ${formatSectionTitleList(missingBasics(config))}`,
    `- Missing profile areas: ${formatSectionTitleList(missingSectionTitles)}`,
    "",
    "## Source Of Truth",
    "",
    formatProfileSourceList(sections),
    "",
    "## Style Guardrails",
    "",
    "- Write like a real person. No em dashes, no bullet-point coaching, no overly polished phrasing. Use plain, warm, natural language.",
    "- Be psychologically perceptive, but stay concrete.",
    "- Prefer natural curiosity over generic coaching scripts.",
    "- If the user is in pain, help first. Profile-building is secondary to care.",
  ].join("\n");
}

function syncOpenClawMemoryFiles(config: UserConfig, sections: ProfileSection[]): void {
  const workspaceDir = resolveClawJSWorkspaceDir();
  fs.mkdirSync(workspaceDir, { recursive: true });

  const userPath = path.join(workspaceDir, "USER.md");
  const soulPath = path.join(workspaceDir, "SOUL.md");
  const legacyWorkspaceDir = resolveLegacyDefaultOpenClawWorkspaceDir();
  const legacyUserPath = path.join(legacyWorkspaceDir, "USER.md");
  const legacySoulPath = path.join(legacyWorkspaceDir, "SOUL.md");

  const existingUser = readFileIfExists(userPath)
    || (legacyWorkspaceDir !== workspaceDir ? readFileIfExists(legacyUserPath) : "")
    || DEFAULT_USER_TEMPLATE;
  const existingSoul = readFileIfExists(soulPath)
    || (legacyWorkspaceDir !== workspaceDir ? readFileIfExists(legacySoulPath) : "")
    || DEFAULT_SOUL_TEMPLATE;

  fs.writeFileSync(userPath, stripLegacyManagedBlock(existingUser, USER_MANAGED_START, USER_MANAGED_END));
  fs.writeFileSync(soulPath, stripLegacyManagedBlock(existingSoul, SOUL_MANAGED_START, SOUL_MANAGED_END));

  syncBinding({
    workspaceDir,
    binding: USER_MANAGED_BINDING,
    settings: { config, sections },
    render: () => buildManagedUserBlock(config, sections),
  });
  syncBinding({
    workspaceDir,
    binding: SOUL_MANAGED_BINDING,
    settings: { config, sections },
    render: () => buildManagedSoulBlock(config, sections),
  });
}

function resolveLegacyContent(sectionId: string, dir: string): string {
  const sources: Record<string, Array<{ fileName: string; label?: string }>> = {
    overview: [
      { fileName: "your-story.md", label: "Story" },
      { fileName: "current-context.md", label: "Current Context" },
    ],
    relationships: [
      { fileName: "relationships.md" },
    ],
    health: [
      { fileName: "wellbeing-patterns.md", label: "Wellbeing" },
    ],
    chat: [
      { fileName: "chat-preferences.md", label: "Assistant Preferences" },
    ],
  };

  const matches = (sources[sectionId] || [])
    .map((source) => {
      const sourcePath = path.join(dir, source.fileName);
      if (!fs.existsSync(sourcePath)) return "";
      const content = normalizeContent(readFileIfExists(sourcePath));
      if (!content) return "";
      return source.label && sources[sectionId].length > 1
        ? `### ${source.label}\n${content}`
        : content;
    })
    .filter(Boolean);

  return matches.join("\n\n");
}

function loadProfileSections(config: UserConfig): ProfileSection[] {
  const dir = profileSectionsDir();
  fs.mkdirSync(dir, { recursive: true });

  const legacyProfile = normalizeContent(readFileIfExists(generatedProfilePath(config)));
  const hasExistingSections = PROFILE_SECTION_DEFINITIONS.some((section) =>
    fs.existsSync(path.join(dir, section.fileName))
  );
  const shouldSeedOverview = !hasExistingSections
    && !!legacyProfile
    && !legacyProfile.includes(GENERATED_MARKER);

  return PROFILE_SECTION_DEFINITIONS.map((section) => {
    const filePath = path.join(dir, section.fileName);
    if (!fs.existsSync(filePath)) {
      const migratedContent = resolveLegacyContent(section.id, dir);
      const initialContent = migratedContent
        || (shouldSeedOverview && section.id === "overview" ? `${legacyProfile}\n` : "");
      fs.writeFileSync(filePath, initialContent);
    }

    return {
      ...section,
      path: filePath,
      content: readFileIfExists(filePath),
    };
  });
}

function renderBasicProfile(config: UserConfig): string {
  const rows = [
    ["Preferred name", config.displayName],
    ["Age", config.profileBasics?.age || ""],
    ["Gender", config.profileBasics?.gender || ""],
    ["Location", config.profileBasics?.location || ""],
    ["Occupation", config.profileBasics?.occupation || ""],
  ].filter(([, value]) => value && value.trim().length > 0);

  if (rows.length === 0) {
    return "- No basic profile fields filled yet.";
  }

  return rows.map(([label, value]) => `- ${label}: ${value}`).join("\n");
}

function renderSectionIndex(sections: ProfileSection[]): string {
  return sections.map((section, index) =>
    `${index + 1}. ${section.title} (\`${section.path}\`)`
  ).join("\n");
}

function renderSections(sections: ProfileSection[]): string {
  return sections.map((section) => {
    const body = normalizeContent(section.content) || "_No content provided yet._";
    return [
      `## ${section.title}`,
      `Source: \`${section.path}\``,
      "",
      body,
    ].join("\n");
  }).join("\n\n");
}

export function buildGeneratedProfileMarkdown(config: UserConfig): string {
  const sections = loadProfileSections(config);

  return [
    GENERATED_MARKER,
    "# User Context",
    "",
    "This file is generated from the structured profile sources in the OpenClaw workspace.",
    "Edit the fields from Settings or update the source files directly if needed.",
    "",
    "## Basic Profile",
    renderBasicProfile(config),
    "",
    "## Section Index",
    renderSectionIndex(sections),
    "",
    renderSections(sections),
    "",
  ].join("\n");
}

export function loadStructuredProfile(): StructuredProfile {
  const config = readFreshUserConfig();
  const sections = loadProfileSections(config);
  const generatedContent = buildGeneratedProfileMarkdown(config);
  fs.writeFileSync(generatedProfilePath(config), generatedContent);
  syncOpenClawMemoryFiles(config, sections);

  return {
    sections,
    generatedContent,
    content: generatedContent,
  };
}

export function syncGeneratedProfile(): string {
  const config = readFreshUserConfig();
  const sections = loadProfileSections(config);
  const generatedContent = buildGeneratedProfileMarkdown(config);
  fs.writeFileSync(generatedProfilePath(config), generatedContent);
  syncOpenClawMemoryFiles(config, sections);
  return generatedContent;
}

export function saveProfileSections(
  sections: Array<{ id: string; content: string }>,
  configOverride?: Partial<Pick<UserConfig, "displayName" | "profileBasics" | "profileFile">>
): StructuredProfile {
  const baseConfig = readFreshUserConfig();
  const config = mergeProfileConfig(baseConfig, configOverride);
  const existingSections = loadProfileSections(baseConfig);
  const contentById = new Map(sections.map((section) => [section.id, section.content]));

  for (const section of existingSections) {
    const nextContent = contentById.get(section.id);
    if (typeof nextContent === "string") {
      fs.writeFileSync(section.path, nextContent.replace(/\r\n/g, "\n"));
    }
  }

  const generatedContent = buildGeneratedProfileMarkdown(config);
  fs.writeFileSync(generatedProfilePath(config), generatedContent);
  const nextSections = loadProfileSections(baseConfig);
  syncOpenClawMemoryFiles(config, nextSections);
  return {
    sections: nextSections,
    generatedContent,
    content: generatedContent,
  };
}

export function buildProfileMemoryPrompt(): string {
  const config = readFreshUserConfig();
  const sections = loadProfileSections(config);
  return buildProfileCompletionGuidance(config, sections);
}
