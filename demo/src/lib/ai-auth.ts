export type AiAuthSummary = {
  hasAuth?: boolean;
  hasSubscription?: boolean;
  hasProfileApiKey?: boolean;
  enabledForAgent?: boolean;
};

export function getOAuthProviderSummary(
  providers: Record<string, AiAuthSummary> | null | undefined,
  oauthProviderId: string,
): AiAuthSummary | undefined {
  return providers?.[oauthProviderId];
}

export function hasConfirmedOAuthSubscription(
  providers: Record<string, AiAuthSummary> | null | undefined,
  oauthProviderId: string,
): boolean {
  const summary = getOAuthProviderSummary(providers, oauthProviderId);
  return !!summary?.hasAuth
    && !!summary?.hasSubscription
    && summary.enabledForAgent !== false;
}
