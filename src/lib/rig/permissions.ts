export type UserRole = 'member' | 'trainer' | 'owner'

export function canAccessCoach(role: UserRole): boolean {
  return role === 'trainer' || role === 'owner'
}

export function canAccessOwnerDashboard(role: UserRole): boolean {
  return role === 'trainer' || role === 'owner'
}

export function isRIGUser(_role: UserRole): boolean {
  return true
}
