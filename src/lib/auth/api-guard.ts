import { NextResponse } from 'next/server';
import { getCurrentUser, type CurrentUser } from '@/lib/auth/profile';

// Same gate /api/dashboard already used: a resolved app user, or 401.
// getCurrentUser returns null when there is no session and when the session
// belongs to someone who is not allowlisted and has no profile.
export async function requireUser(): Promise<
  { ok: true; user: CurrentUser } | { ok: false; response: NextResponse }
> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }
  return { ok: true, user };
}
