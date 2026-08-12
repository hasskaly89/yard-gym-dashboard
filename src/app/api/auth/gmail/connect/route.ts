import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/profile';
import { getAuthUrl } from '@/lib/email/gmail-oauth';

// Kicks off the Google OAuth consent flow for a scope's Gmail inbox — used by
// the business scope, whose Workspace disables app passwords.
export async function GET(request: Request) {
  const me = await getCurrentUser();
  if (!me || me.role !== 'admin') {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 });
  }

  const scope = new URL(request.url).searchParams.get('scope');
  if (scope !== 'business' && scope !== 'personal') {
    return NextResponse.json({ error: 'Invalid scope' }, { status: 400 });
  }

  const url = getAuthUrl(scope);
  if (!url) {
    return NextResponse.json({ error: 'OAuth not configured' }, { status: 500 });
  }
  return NextResponse.redirect(url);
}
