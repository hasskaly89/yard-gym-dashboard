import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { computeAccess, type Access } from '@/lib/access';

export type CurrentUser = { id: string; email: string } & Access;

// Server-side: resolves the logged-in user + their effective access. Lazily
// creates a profile row on first sight so new users are managed in the admin
// screen. Returns null when not logged in.
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;

  const admin = createAdminClient();
  const { data: prof } = await admin
    .from('profiles')
    .select('role, allowed_pages')
    .eq('id', user.id)
    .maybeSingle();

  if (!prof) {
    await admin
      .from('profiles')
      .upsert({ id: user.id, email: user.email }, { onConflict: 'id' });
  }

  const access = computeAccess({
    email: user.email,
    profileRole: prof?.role,
    profileAllowedPages: prof?.allowed_pages,
  });

  return { id: user.id, email: user.email, ...access };
}
