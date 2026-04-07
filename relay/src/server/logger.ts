export interface RelayLogEntry {
  level: "info" | "warn" | "error";
  message: string;
}

const INLINE_SECRET_PATTERNS = [
  /\bBearer\s+([A-Za-z0-9._-]{6,})/gi,
  /\b(token|secret|password|authorization)\b\s*[:=]\s*([^\s,;]+)/gi,
];

function redactString(value: string): string {
  if (value.length <= 8) return "*".repeat(Math.max(4, value.length));
  return `${"*".repeat(Math.max(4, value.length - 4))}${value.slice(-4)}`;
}

export function redactSecrets(input: string): string {
  let redacted = input;
  redacted = redacted.replaceAll(INLINE_SECRET_PATTERNS[0], (_match, token: string) => `Bearer ${redactString(token)}`);
  redacted = redacted.replaceAll(INLINE_SECRET_PATTERNS[1], (_match, key: string, value: string) => `${key}=${redactString(value)}`);
  return redacted;
}

export class RelayLogger {
  readonly entries: RelayLogEntry[] = [];

  private push(level: RelayLogEntry["level"], message: string): void {
    const safe = redactSecrets(message);
    this.entries.push({ level, message: safe });
    const line = `[relay][${level}] ${safe}`;
    if (level === "error") console.error(line);
    else console.log(line);
  }

  info(message: string): void {
    this.push("info", message);
  }

  warn(message: string): void {
    this.push("warn", message);
  }

  error(message: string): void {
    this.push("error", message);
  }
}
