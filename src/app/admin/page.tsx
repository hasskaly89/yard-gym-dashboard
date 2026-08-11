import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/profile';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  computeAccess,
  superAdminEmails,
  PAGES,
  type PageKey,
  type Role,
} from '@/lib/access';
import AdminClient from './AdminClient';

export const dynamic = 'force-dynamic';

export type AdminUserRow = {
  id: string;
  email: string;
  role: Role;
  allowedPages: PageKey[];
  isSuperAdmin: boolean;
};

export default async function AdminPage() {
  const me = await getCurrentUser();
  if (!me || me.role !== 'admin') redirect('/');

  const admin = createAdminClient();
  const [{ data: authList }, { data: profiles }] = await Promise.all([
    admin.auth.admin.listUsers(),
    admin.from('profiles').select('id, email, role, allowed_pages'),
  ]);

  const profById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const supers = superAdminEmails();

  const users: AdminUserRow[] = (authList?.users ?? [])
    .filter((u) => u.email)
    .map((u) => {
      const p = profById.get(u.id);
      const access = computeAccess({
        email: u.email!,
        profileRole: p?.role,
        profileAllowedPages: p?.allowed_pages,
      });
      return {
        id: u.id,
        email: u.email!,
        role: access.role,
        allowedPages: access.allowedPages,
        isSuperAdmin: supers.includes(u.email!.toLowerCase()),
      };
    })
    .sort((a, b) => a.email.localeCompare(b.email));

  return (
    <AdminClient
      users={users}
      pages={PAGES.map((p) => ({ key: p.key, label: p.label }))}
      meEmail={me.email}
    />
  );
}
