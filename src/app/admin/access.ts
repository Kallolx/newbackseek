// Which admin screens an account may open. Administrators see everything; managers see only what an administrator granted.
// The API enforces the same rules on every request; this only keeps the screens tidy.
export type Account = { id: string; username: string; email?: string; role: string; display_name?: string | null; permissions?: string[] };

export const permissionOf: Record<string, string | null> = {
  Overview: 'overview', Ads: 'ads', Publish: 'publish', 'Bump post': 'bump', 'Distribute post': 'distribute', 'Post planner': 'planner',
  Users: 'users', Media: 'media', Reports: 'reports', Verification: 'verification', 'System health': 'health',
  Security: 'security', VPN: 'vpn', Team: null,
};

export function canOpen(account: Account | undefined, screen: string) {
  if (!account) return false;
  if (account.role === 'admin') return true;
  const key = permissionOf[screen];
  return account.role === 'manager' && Boolean(key && account.permissions?.includes(key));
}
