'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth/profile';
import { createAdminClient } from '@/lib/supabase/admin';
import { ALL_PAGE_KEYS, type PageKey } from '@/lib/access';
import type { Role } from '@/lib/access';
import { randomBytes } from 'crypto';

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

// Admin-only: add a new staff member. Creates their login (email + a temporary
// password to share) and their profile with the chosen pages. If the email
// already has an account, just (re)authorises it with a profile.
export async function addStaff(input: {
  email: string;
  allowedPages: PageKey[];
}): Promise<
  | { ok: true; email: string; tempPassword: string | null; existed: boolean }
  | { ok: false; error: string }
> {
  const me = await getCurrentUser();
  if (!me || me.role !== 'admin') return { ok: false, error: 'Not authorised' };

  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, error: 'Enter a valid email address' };
  }
  const allowed = input.allowedPages.filter((p) => ALL_PAGE_KEYS.includes(p));
  const admin = createAdminClient();

  // Try to create the auth user with a temporary password.
  const tempPassword = `Yard-${randomBytes(4).toString('hex')}`;
  let userId: string | undefined;
  let tempToReturn: string | null = tempPassword;
  let existed = false;

  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
  });

  if (cErr || !created?.user) {
    // Likely already exists — find them and just (re)authorise via a profile.
    const { data: list } = await admin.auth.admin.listUsers();
    const existing = list?.users?.find((u) => u.email?.toLowerCase() === email);
    if (!existing) return { ok: false, error: cErr?.message ?? 'Could not create user' };
    userId = existing.id;
    tempToReturn = null; // they already have a password
    existed = true;
  } else {
    userId = created.user.id;
  }

  const { error: pErr } = await admin.from('profiles').upsert(
    {
      id: userId,
      email,
      role: 'staff',
      allowed_pages: allowed,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  );
  if (pErr) return { ok: false, error: pErr.message };

  revalidatePath('/admin');
  return { ok: true, email, tempPassword: tempToReturn, existed };
}
