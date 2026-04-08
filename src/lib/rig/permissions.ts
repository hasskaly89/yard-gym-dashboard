export type UserRole = 'member' | 'admin'

export function isAdmin(role: UserRole): boolean {
  return role === 'admin'
}

export function canAccessCoach(role: UserRole): boolean {
  return role === 'admin'
}

export function canAccessOwnerDashboard(role: UserRole): boolean {
  return role === 'admin'
}

export function canAccessRIG(_role: UserRole): boolean {
  return true
}
