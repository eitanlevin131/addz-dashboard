export function canonicalPortfolioAccounts<
  T extends { id: string; flashyAccountId: number; lastSyncAt: string },
>(accounts: T[]): T[] {
  const canonical = new Map<string, T>();

  for (const account of accounts) {
    const key = account.flashyAccountId > 0 ? `flashy:${account.flashyAccountId}` : `account:${account.id}`;
    const current = canonical.get(key);
    if (!current || Date.parse(account.lastSyncAt) > Date.parse(current.lastSyncAt)) {
      canonical.set(key, account);
    }
  }

  return Array.from(canonical.values());
}
