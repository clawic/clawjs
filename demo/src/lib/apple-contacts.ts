import { execFile } from "child_process";
import type { ContactsIntegrationStatus, NativeContact } from "./contacts-types";

export type { ContactsIntegrationStatus, NativeContact } from "./contacts-types";

import { hasBinary as checkCommand } from "@/lib/platform";

function execOsa(args: string[], timeoutMs = 10000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("osascript", args, { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr?.trim() || err.message));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

function isPermissionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  return normalized.includes("-1743")
    || normalized.includes("not authorized")
    || normalized.includes("not permitted")
    || normalized.includes("privilege violation");
}

export async function getContactsIntegrationStatus(): Promise<ContactsIntegrationStatus> {
  if (process.platform !== "darwin") {
    return {
      installed: false,
      available: false,
      needsPermission: false,
      backend: "unsupported",
      contactCount: 0,
      message: "Contacts.app integration is only available on macOS.",
    };
  }

  const osascriptAvailable = await checkCommand("osascript");
  if (!osascriptAvailable) {
    return {
      installed: false,
      available: false,
      needsPermission: false,
      backend: "unsupported",
      contactCount: 0,
      message: "osascript is not available on this Mac.",
    };
  }

  try {
    // Quick count to verify access
    const script = `
function run() {
  const app = Application("Contacts");
  return JSON.stringify({ count: app.people().length });
}
`;
    const raw = await execOsa(["-l", "JavaScript", "-e", script]);
    const result = JSON.parse(raw) as { count: number };

    return {
      installed: true,
      available: result.count > 0,
      needsPermission: false,
      backend: "apple-contacts",
      contactCount: result.count,
      message: result.count === 0
        ? "Open Contacts.app and make sure you have contacts."
        : `Contacts.app is connected (${result.count} contacts).`,
    };
  } catch (error) {
    if (isPermissionError(error)) {
      return {
        installed: true,
        available: false,
        needsPermission: true,
        backend: "apple-contacts",
        contactCount: 0,
        message: "Allow Contacts access for ClawJS in macOS Privacy & Security.",
      };
    }

    return {
      installed: true,
      available: false,
      needsPermission: false,
      backend: "apple-contacts",
      contactCount: 0,
      message: error instanceof Error ? error.message : "Could not read Contacts.app.",
    };
  }
}

export async function listNativeContacts(options?: {
  limit?: number;
}): Promise<NativeContact[]> {
  if (process.platform !== "darwin") return [];
  if (!await checkCommand("osascript")) return [];

  const limit = options?.limit ?? 500;

  const script = `
function safeString(value) {
  return value === null || value === undefined ? "" : String(value);
}

function run(argv) {
  var limit = Number(argv[0]) || 500;
  var app = Application("Contacts");
  var people = app.people();
  var output = [];

  var count = Math.min(people.length, limit);
  for (var i = 0; i < count; i++) {
    var person = people[i];
    var emails = [];
    var phones = [];

    try {
      var emailObjs = person.emails();
      for (var e = 0; e < emailObjs.length; e++) {
        var val = safeString(emailObjs[e].value());
        if (val) emails.push(val);
      }
    } catch (_e) {}

    try {
      var phoneObjs = person.phones();
      for (var p = 0; p < phoneObjs.length; p++) {
        var val = safeString(phoneObjs[p].value());
        if (val) phones.push(val);
      }
    } catch (_e) {}

    output.push({
      id: safeString(person.id()),
      firstName: safeString(person.firstName()),
      lastName: safeString(person.lastName()),
      company: safeString(person.organization()),
      emails: emails,
      phones: phones,
      note: safeString(person.note())
    });
  }

  return JSON.stringify(output);
}
`;

  try {
    const raw = await execOsa([
      "-l",
      "JavaScript",
      "-e",
      script,
      String(limit),
    ], 60000);

    return JSON.parse(raw) as NativeContact[];
  } catch (error) {
    if (isPermissionError(error)) {
      return [];
    }

    console.error("[contacts] Failed to read Contacts.app:", error);
    return [];
  }
}
