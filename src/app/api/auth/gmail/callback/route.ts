import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/profile';
import { exchangeCodeForRefreshToken, storeRefreshToken } from '@/lib/email/gmail-oauth';

// Completes the Google OAuth flow: exchanges the auth code for a refresh
// token and stores it, then sends the admin back to the dashboard.
export async function GET(request: Request) {
  const me = await getCurrentUser();
  if (!me || me.role !== 'admin') {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 });
  }

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const scope = url.searchParams.get('state');
  if (!code || (scope !== 'business' && scope !== 'personal')) {
    return NextResponse.redirect(new URL('/?gmail=error', request.url));
  }

  const refreshToken = await exchangeCodeForRefreshToken(code);
  if (!refreshToken) {
    return NextResponse.redirect(new URL('/?gmail=error', request.url));
  }

  await storeRefreshToken(scope, refreshToken);
  return NextResponse.redirect(new URL('/?gmail=connected', request.url));
}
