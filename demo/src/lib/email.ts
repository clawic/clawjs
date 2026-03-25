/**
 * Cross-platform email abstraction.
 * Delegates to the correct backend based on the current OS.
 */

import { isMac, isWindows } from "@/lib/platform";

export type { EmailAccountSource, EmailIntegrationStatus, EmailEnvelope } from "./email-types";
export { resolveSelectedEmailAccountIds } from "./email-utils";
import type { EmailIntegrationStatus, EmailEnvelope } from "./email-types";

const UNSUPPORTED_STATUS: EmailIntegrationStatus = {
  installed: false,
  available: false,
  backend: "unsupported",
  accounts: [],
  selectedAccountsValid: false,
  message: "No email integration is available for this platform.",
};

export async function getMailIntegrationStatus(selectedIds?: string[]): Promise<EmailIntegrationStatus> {
  if (isMac) {
    const mod = await import("@/lib/apple-mail");
    return mod.getMailIntegrationStatus(selectedIds);
  }
  if (isWindows) {
    const mod = await import("@/lib/outlook-mail");
    return mod.getMailIntegrationStatus(selectedIds);
  }
  return UNSUPPORTED_STATUS;
}

export async function listRecentEmailEnvelopes(options?: {
  selectedAccountIds?: string[];
  maxCount?: number;
}): Promise<EmailEnvelope[]> {
  if (isMac) {
    const mod = await import("@/lib/apple-mail");
    return mod.listRecentEmailEnvelopes(options);
  }
  if (isWindows) {
    const mod = await import("@/lib/outlook-mail");
    return mod.listRecentEmailEnvelopes(options);
  }
  return [];
}
