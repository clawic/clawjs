/**
 * Cross-platform native contacts abstraction.
 * Delegates to the correct backend based on the current OS.
 */

import { isMac } from "@/lib/platform";

export type { NativeContact, ContactsIntegrationStatus } from "./contacts-types";
import type { ContactsIntegrationStatus, NativeContact } from "./contacts-types";

const UNSUPPORTED_STATUS: ContactsIntegrationStatus = {
  installed: false,
  available: false,
  needsPermission: false,
  backend: "unsupported",
  contactCount: 0,
  message: "No contacts integration is available for this platform.",
};

export async function getContactsIntegrationStatus(): Promise<ContactsIntegrationStatus> {
  if (isMac) {
    const mod = await import("@/lib/apple-contacts");
    return mod.getContactsIntegrationStatus();
  }
  // Windows Outlook contacts could be added here in the future
  return UNSUPPORTED_STATUS;
}

export async function listNativeContacts(options?: {
  limit?: number;
}): Promise<NativeContact[]> {
  if (isMac) {
    const mod = await import("@/lib/apple-contacts");
    return mod.listNativeContacts(options);
  }
  return [];
}
