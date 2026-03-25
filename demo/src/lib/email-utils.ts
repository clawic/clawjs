import { ALL_EMAIL_ACCOUNTS_ID } from "@/lib/email-constants";
import type { EmailAccountSource } from "./email-types";

export function resolveSelectedEmailAccountIds(
  selectedIds: string[] | undefined,
  availableAccounts: EmailAccountSource[]
): string[] {
  const safeSelectedIds = Array.isArray(selectedIds) ? selectedIds.filter(Boolean) : [];
  if (safeSelectedIds.length === 0) return [];
  if (safeSelectedIds.includes(ALL_EMAIL_ACCOUNTS_ID)) {
    return availableAccounts.map((account) => account.id);
  }

  const resolved = new Set<string>();
  for (const selectedId of safeSelectedIds) {
    const match = availableAccounts.find((account) => account.id === selectedId || account.email === selectedId);
    if (match) {
      resolved.add(match.id);
    }
  }

  return Array.from(resolved);
}
