import { execFile } from "child_process";
import { ALL_EMAIL_ACCOUNTS_ID } from "@/lib/email-constants";
import type { EmailAccountSource, EmailIntegrationStatus, EmailEnvelope } from "./email-types";

export type { EmailAccountSource, EmailIntegrationStatus, EmailEnvelope } from "./email-types";
export { resolveSelectedEmailAccountIds } from "./email-utils";
import { resolveSelectedEmailAccountIds } from "./email-utils";

interface EmailMockPayload {
  installed?: boolean;
  available?: boolean;
  message?: string | null;
  accounts?: EmailAccountSource[];
  envelopes?: EmailEnvelope[];
}

function execOsa(lines: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("osascript", lines.flatMap((line) => ["-e", line]), { timeout: 20000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr?.trim() || err.message));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

function parseMockPayload(): EmailMockPayload | null {
  const raw = process.env.CLAWJS_LEGACY_EMAIL_MOCK;
  if (!raw) return null;

  try {
    return JSON.parse(raw) as EmailMockPayload;
  } catch {
    return null;
  }
}

function parseTabSeparatedRecords(raw: string): string[][] {
  if (!raw.trim()) return [];

  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split("\t"));
}

function buildMockStatus(selectedIds?: string[]): EmailIntegrationStatus {
  const mock = parseMockPayload() || {};
  const accounts = Array.isArray(mock.accounts) ? mock.accounts : [];
  const selectedAccountsValid = !selectedIds?.length
    || selectedIds.includes(ALL_EMAIL_ACCOUNTS_ID)
    || resolveSelectedEmailAccountIds(selectedIds, accounts).length === selectedIds.filter(Boolean).length;

  return {
    installed: mock.installed ?? true,
    available: mock.available ?? accounts.length > 0,
    backend: "mock",
    accounts,
    selectedAccountsValid,
    message: mock.message ?? (accounts.length > 0
      ? "Email on this Mac is ready."
      : "No email accounts are configured in Mail."),
  };
}

async function listNativeMailAccounts(): Promise<EmailAccountSource[]> {
  const raw = await execOsa([
    'tell application "Mail"',
    'set output to ""',
    'repeat with acct in every account',
    'set acctId to ""',
    'set acctName to ""',
    'set acctEmail to ""',
    'set acctEnabled to "false"',
    'try',
    'set acctId to id of acct as text',
    'end try',
    'try',
    'set acctName to name of acct as text',
    'end try',
    'try',
    'set acctEnabled to enabled of acct as text',
    'end try',
    'try',
    'set acctEmails to email addresses of acct',
    'if (count of acctEmails) > 0 then set acctEmail to item 1 of acctEmails as text',
    'end try',
    'set output to output & acctId & tab & acctName & tab & acctEmail & tab & acctEnabled & linefeed',
    'end repeat',
    'return output',
    'end tell',
  ]);

  return parseTabSeparatedRecords(raw)
    .map(([id, displayName, email, enabled]) => ({
      id: id || displayName || email,
      email: email || "",
      displayName: displayName || email || id || "",
      default: enabled === "true",
    }))
    .filter((account) => account.id);
}

export async function getMailIntegrationStatus(selectedIds?: string[]): Promise<EmailIntegrationStatus> {
  const mock = parseMockPayload();
  if (mock) {
    return buildMockStatus(selectedIds);
  }

  if (process.platform !== "darwin") {
    return {
      installed: false,
      available: false,
      backend: "unsupported",
      accounts: [],
      selectedAccountsValid: false,
      message: "Email integration is only available on macOS.",
    };
  }

  try {
    const accounts = await listNativeMailAccounts();
    const selectedAccountsValid = !selectedIds?.length
      || selectedIds.includes(ALL_EMAIL_ACCOUNTS_ID)
      || resolveSelectedEmailAccountIds(selectedIds, accounts).length === selectedIds.filter(Boolean).length;

    return {
      installed: true,
      available: accounts.length > 0,
      backend: "apple-mail",
      accounts,
      selectedAccountsValid,
      message: accounts.length === 0
        ? "No accounts are configured in Mail on this Mac."
        : !selectedAccountsValid
          ? "Choose one of the email accounts available in Mail."
          : "Email on this Mac is connected.",
    };
  } catch (error) {
    return {
      installed: true,
      available: false,
      backend: "apple-mail",
      accounts: [],
      selectedAccountsValid: false,
      message: error instanceof Error ? error.message : "Could not read Mail on this Mac.",
    };
  }
}

export async function listRecentEmailEnvelopes(options?: {
  selectedAccountIds?: string[];
  maxCount?: number;
}): Promise<EmailEnvelope[]> {
  const mock = parseMockPayload();
  if (mock) {
    const accounts = Array.isArray(mock.accounts) ? mock.accounts : [];
    const selectedIds = resolveSelectedEmailAccountIds(options?.selectedAccountIds, accounts);
    const envelopes = Array.isArray(mock.envelopes) ? mock.envelopes : [];

    return envelopes.filter((envelope) => {
      if (selectedIds.length === 0) return true;
      return selectedIds.includes(envelope.accountId);
    });
  }

  if (process.platform !== "darwin") return [];

  const maxCount = options?.maxCount ?? 80;

  try {
    const raw = await execOsa([
      'set maxCount to ' + String(maxCount),
      'tell application "Mail"',
      'set output to ""',
      'set inboxMessages to messages of inbox',
      'set totalMessages to count of inboxMessages',
      'if totalMessages > maxCount then set totalMessages to maxCount',
      'repeat with idx from 1 to totalMessages',
      'set msg to item idx of inboxMessages',
      'set accountId to ""',
      'set accountEmail to ""',
      'try',
      'set acct to account of mailbox of msg',
      'set accountId to id of acct as text',
      'set acctEmails to email addresses of acct',
      'if (count of acctEmails) > 0 then set accountEmail to item 1 of acctEmails as text',
      'end try',
      'set msgId to ""',
      'set msgSubject to ""',
      'set msgSender to ""',
      'set msgDate to ""',
      'try',
      'set msgId to message id of msg as text',
      'end try',
      'try',
      'set msgSubject to subject of msg as text',
      'end try',
      'try',
      'set msgSender to sender of msg as text',
      'end try',
      'try',
      'set msgDate to date received of msg as text',
      'end try',
      'set output to output & msgId & tab & accountId & tab & accountEmail & tab & msgDate & tab & msgSender & tab & msgSubject & linefeed',
      'end repeat',
      'return output',
      'end tell',
    ]);

    const accounts = await listNativeMailAccounts();
    const selectedIds = resolveSelectedEmailAccountIds(options?.selectedAccountIds, accounts);

    return parseTabSeparatedRecords(raw)
      .map(([id, accountId, accountEmail, date, from, subject]) => ({
        id: id || `${accountId}-${subject}`,
        accountId,
        accountEmail,
        subject: subject || "(no subject)",
        from: from || "",
        date: date || "",
      }))
      .filter((envelope) => {
        if (selectedIds.length === 0) return true;
        return selectedIds.includes(envelope.accountId);
      });
  } catch (error) {
    console.error("[email] Failed to read Mail.app:", error);
    return [];
  }
}
