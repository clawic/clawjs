export interface NativeContact {
  id: string;
  firstName: string;
  lastName: string;
  company: string;
  emails: string[];
  phones: string[];
  note: string;
}

export type ContactsBackend = "apple-contacts" | "outlook" | "mock" | "unsupported";

export interface ContactsIntegrationStatus {
  installed: boolean;
  available: boolean;
  needsPermission: boolean;
  backend: ContactsBackend;
  contactCount: number;
  message: string | null;
}
