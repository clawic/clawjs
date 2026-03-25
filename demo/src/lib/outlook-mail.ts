import { execFile } from "child_process";
import { ALL_EMAIL_ACCOUNTS_ID } from "@/lib/email-constants";
import type { EmailAccountSource, EmailIntegrationStatus, EmailEnvelope } from "./email-types";
import { resolveSelectedEmailAccountIds } from "./email-utils";

function execPowerShell(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
      timeout: 20000,
      maxBuffer: 10 * 1024 * 1024,
    }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr?.trim() || err.message));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

function isOutlookNotInstalled(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  return normalized.includes("retrieving the com class factory")
    || normalized.includes("80040154")
    || normalized.includes("not registered")
    || normalized.includes("cannot create")
    || normalized.includes("is not recognized");
}

async function listOutlookAccounts(): Promise<EmailAccountSource[]> {
  const script = `
$ErrorActionPreference = "Stop"
$ol = New-Object -ComObject Outlook.Application
$ns = $ol.GetNamespace("MAPI")
$defaultAddr = ""
try { $defaultAddr = $ns.CurrentUser.AddressEntry.GetExchangeUser().PrimarySmtpAddress } catch {}
$result = @()
foreach ($acct in $ns.Accounts) {
  $result += @{
    id = $acct.SmtpAddress
    email = $acct.SmtpAddress
    displayName = $acct.DisplayName
    default = ($acct.SmtpAddress -eq $defaultAddr)
  }
}
$result | ConvertTo-Json -Compress -AsArray
`;
  const raw = await execPowerShell(script);
  if (!raw || raw === "null") return [];
  return JSON.parse(raw) as EmailAccountSource[];
}

export async function getMailIntegrationStatus(selectedIds?: string[]): Promise<EmailIntegrationStatus> {
  try {
    const accounts = await listOutlookAccounts();
    const selectedAccountsValid = !selectedIds?.length
      || selectedIds.includes(ALL_EMAIL_ACCOUNTS_ID)
      || resolveSelectedEmailAccountIds(selectedIds, accounts).length === selectedIds.filter(Boolean).length;

    return {
      installed: true,
      available: accounts.length > 0,
      backend: "outlook",
      accounts,
      selectedAccountsValid,
      message: accounts.length === 0
        ? "No accounts are configured in Outlook on this PC."
        : !selectedAccountsValid
          ? "Choose one of the email accounts available in Outlook."
          : "Outlook email is connected on this PC.",
    };
  } catch (error) {
    if (isOutlookNotInstalled(error)) {
      return {
        installed: false,
        available: false,
        backend: "outlook",
        accounts: [],
        selectedAccountsValid: false,
        message: "Microsoft Outlook is not installed on this PC.",
      };
    }

    return {
      installed: true,
      available: false,
      backend: "outlook",
      accounts: [],
      selectedAccountsValid: false,
      message: error instanceof Error ? error.message : "Could not read Outlook email.",
    };
  }
}

export async function listRecentEmailEnvelopes(options?: {
  selectedAccountIds?: string[];
  maxCount?: number;
}): Promise<EmailEnvelope[]> {
  const maxCount = options?.maxCount ?? 80;

  const script = `
$ErrorActionPreference = "Stop"
$ol = New-Object -ComObject Outlook.Application
$ns = $ol.GetNamespace("MAPI")
$inbox = $ns.GetDefaultFolder(6)
$items = $inbox.Items
$items.Sort("[ReceivedTime]", $true)
$maxCount = ${maxCount}
$result = @()
$count = 0

foreach ($msg in $items) {
  if ($count -ge $maxCount) { break }
  $accountEmail = ""
  try {
    $acct = $msg.SendUsingAccount
    if ($acct) { $accountEmail = $acct.SmtpAddress }
  } catch {}

  $result += @{
    id = if ($msg.EntryID) { $msg.EntryID } else { "" }
    accountId = $accountEmail
    accountEmail = $accountEmail
    subject = if ($msg.Subject) { $msg.Subject } else { "(no subject)" }
    from = if ($msg.SenderName) { $msg.SenderName } else { "" }
    date = if ($msg.ReceivedTime) { $msg.ReceivedTime.ToString("o") } else { "" }
  }
  $count++
}

$result | ConvertTo-Json -Compress -AsArray
`;

  try {
    const raw = await execPowerShell(script);
    if (!raw || raw === "null") return [];

    const accounts = await listOutlookAccounts();
    const selectedIds = resolveSelectedEmailAccountIds(options?.selectedAccountIds, accounts);

    return (JSON.parse(raw) as EmailEnvelope[]).filter((envelope) => {
      if (selectedIds.length === 0) return true;
      return selectedIds.includes(envelope.accountId);
    });
  } catch (error) {
    console.error("[email] Failed to read Outlook email:", error);
    return [];
  }
}
