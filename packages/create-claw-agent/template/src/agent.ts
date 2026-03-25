import { getAgentSnapshot, getClaw } from "./claw.js";

function normalizePrompt(argv: string[]): string {
  const prompt = argv.join(" ").trim();
  return prompt || "Say hello from __APP_TITLE__.";
}

async function runReport() {
  const snapshot = await getAgentSnapshot();
  process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
}

async function runSession(prompt: string) {
  const claw = await getClaw();
  const session = claw.conversations.createSession("Agent demo");
  claw.conversations.appendMessage(session.sessionId, {
    role: "user",
    content: prompt,
  });

  process.stdout.write(`${JSON.stringify({
    ok: true,
    sessionId: session.sessionId,
    message: prompt,
    sessions: claw.conversations.listSessions().length,
  }, null, 2)}\n`);
}

async function runReply(prompt: string) {
  const claw = await getClaw();
  const session = claw.conversations.createSession("Agent reply");
  claw.conversations.appendMessage(session.sessionId, {
    role: "user",
    content: prompt,
  });

  for await (const chunk of claw.conversations.streamAssistantReply({
    sessionId: session.sessionId,
    transport: "auto",
  })) {
    if (!chunk.done) {
      process.stdout.write(chunk.delta);
    }
  }

  process.stdout.write("\n");
}

const [command = "report", ...rest] = process.argv.slice(2);
const prompt = normalizePrompt(rest);

switch (command) {
  case "report":
    await runReport();
    break;
  case "session":
    await runSession(prompt);
    break;
  case "reply":
    await runReply(prompt);
    break;
  default:
    process.stderr.write(`Unknown agent command: ${command}\n`);
    process.exit(64);
}
