import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { computeAccess, isEmailAllowlisted, type Access } from '@/lib/access';

export type CurrentUser = { id: string; email: string } & Access;

// Server-side: resolves the logged-in user + their effective access. Provisions
// a profile on first sight only for an address on ADMIN_EMAILS, so a public
// Supabase signup cannot become an app user by loading a page. Returns null
// when there is no session, or when the session has no profile and is not
// allowlisted.
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;

  const admin = createAdminClient();
  const { data: prof, error } = await admin
    .from('profiles')
    .select('role, allowed_pages')
    .eq('id', user.id)
    .maybeSingle();
  if (error) throw new Error(`profile read failed: ${error.message}`);

  // A profile row is itself an allowlist entry (the proxy lets anyone with one
  // in). Only provision it for an address already on ADMIN_EMAILS. A public
  // Supabase signup must not grow a profile just by loading a page.
  if (!prof) {
    if (!isEmailAllowlisted(user.email)) return null;
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
