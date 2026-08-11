'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth/profile';
import { createAdminClient } from '@/lib/supabase/admin';
import { ALL_PAGE_KEYS, type PageKey, type Role } from '@/lib/access';

// Admin-only: set a user's role + which pages they may see. Guards on the
// caller being an admin, and writes via the service-role client.
export async function updateUserAccess(input: {
  userId: string;
  email: string;
  role: Role;
  allowedPages: PageKey[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await getCurrentUser();
  if (!me || me.role !== 'admin') return { ok: false, error: 'Not authorised' };

  const role: Role = input.role === 'admin' ? 'admin' : 'staff';
  const allowed = input.allowedPages.filter((p) => ALL_PAGE_KEYS.includes(p));

  const admin = createAdminClient();
  const { error } = await admin.from('profiles').upsert(
    {
      id: input.userId,
      email: input.email,
      role,
      allowed_pages: role === 'admin' ? ALL_PAGE_KEYS : allowed,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath('/admin');
  return { ok: true };
}
