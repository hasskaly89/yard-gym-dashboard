const USER_DISPLAY_NAMES: Record<string, string> = {
  'hasskaly89@gmail.com': 'Hassan',
  'jasminrose.albos@remotetalentstaff.com': 'Jasmine',
};

export function displayNameForEmail(email: string | null | undefined): string {
  if (!email) return 'Unknown';
  const lower = email.toLowerCase();
  if (USER_DISPLAY_NAMES[lower]) return USER_DISPLAY_NAMES[lower];
  const prefix = lower.split('@')[0] ?? '';
  if (!prefix) return 'Unknown';
  return prefix.charAt(0).toUpperCase() + prefix.slice(1);
}
