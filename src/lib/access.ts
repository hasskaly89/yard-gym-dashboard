// Access-control config shared by the proxy (enforcement), the layout/sidebar
// (nav filtering), and the admin screen. Single source of truth for pages +
// permission logic.

export type PageKey =
  | 'dashboard'
  | 'mindbody'
  | 'retention'
  | 'retention-logs'
  | 'xero'
  | 'meta-ads'
  | 'gohighlevel'
  | 'milestones'
  | 'timesheets';

export type NavPage = { key: PageKey; href: string; label: string; icon: string };

export const PAGES: NavPage[] = [
  { key: 'dashboard', href: '/', label: 'Dashboard', icon: '⊞' },
  { key: 'mindbody', href: '/mindbody', label: 'MindBody', icon: '◈' },
  { key: 'retention', href: '/retention', label: 'Retention', icon: '♥' },
  { key: 'retention-logs', href: '/retention/logs', label: 'Retention Logs', icon: '▤' },
  { key: 'xero', href: '/xero', label: 'Xero', icon: '₿' },
  { key: 'meta-ads', href: '/meta-ads', label: 'Meta Ads', icon: '◉' },
  { key: 'gohighlevel', href: '/gohighlevel', label: 'GoHighLevel', icon: '▲' },
  { key: 'milestones', href: '/milestones', label: 'Milestones', icon: '🏆' },
  { key: 'timesheets', href: '/timesheets', label: 'Timesheets', icon: '◷' },
];

export const ALL_PAGE_KEYS: PageKey[] = PAGES.map((p) => p.key);

// Dashboard is always visible to any authenticated, allowlisted user, so staff
// with no granted pages still have a safe landing (and never redirect-loop).
export const ALWAYS_ALLOWED: PageKey[] = ['dashboard'];

// Map a request path to the page it belongs to (longest-prefix wins so
// /retention/logs resolves before /retention). Returns null for non-page paths.
export function pathToPageKey(pathname: string): PageKey | null {
  if (pathname === '/') return 'dashboard';
  const match = PAGES.filter((p) => p.href !== '/')
    .filter((p) => pathname === p.href || pathname.startsWith(p.href + '/'))
    .sort((a, b) => b.href.length - a.href.length)[0];
  return match?.key ?? null;
}

export function superAdminEmails(): string[] {
  return (process.env.SUPER_ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export type Role = 'admin' | 'staff';
export type Access = { role: Role; allowedPages: PageKey[] };

export function computeAccess(opts: {
  email: string;
  profileRole?: string | null;
  profileAllowedPages?: string[] | null;
}): Access {
  const isSuper = superAdminEmails().includes(opts.email.toLowerCase());
  const role: Role = isSuper || opts.profileRole === 'admin' ? 'admin' : 'staff';
  if (role === 'admin') return { role, allowedPages: [...ALL_PAGE_KEYS] };
  const granted = (opts.profileAllowedPages ?? []).filter((k): k is PageKey =>
    ALL_PAGE_KEYS.includes(k as PageKey),
  );
  const allowedPages = Array.from(new Set<PageKey>([...ALWAYS_ALLOWED, ...granted]));
  return { role, allowedPages };
}

export function canAccess(pageKey: PageKey | null, access: Access): boolean {
  if (access.role === 'admin') return true;
  if (!pageKey) return true; // non-page path — proxy still handles login
  return access.allowedPages.includes(pageKey);
}
