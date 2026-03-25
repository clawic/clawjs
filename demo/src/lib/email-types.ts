export interface EmailAccountSource {
  id: string;
  email: string;
  displayName: string;
  default: boolean;
}

export type EmailBackend = "apple-mail" | "outlook" | "mock" | "unsupported";

export interface EmailIntegrationStatus {
  installed: boolean;
  available: boolean;
  backend: EmailBackend;
  accounts: EmailAccountSource[];
  selectedAccountsValid: boolean;
  message: string | null;
}

export interface EmailEnvelope {
  id: string;
  accountId: string;
  accountEmail: string;
  subject: string;
  from: string;
  date: string;
}
