const SESSION_MILESTONES = [25, 50, 100, 150, 200, 250, 300, 500, 1000] as const

const ANNIVERSARY_THRESHOLDS = [
  { months: 3, label: '3 months' },
  { months: 6, label: '6 months' },
  { months: 12, label: '1 year' },
  { months: 24, label: '2 years' },
  { months: 36, label: '3 years' },
] as const

const INACTIVITY_TIERS = [7, 14, 21, 30] as const

export type InactivityTier = (typeof INACTIVITY_TIERS)[number]

export function checkBirthday(birthDate: string | null): boolean {
  if (!birthDate) return false
  const today = new Date()
  const bd = new Date(birthDate + 'T00:00:00')
  return bd.getMonth() === today.getMonth() && bd.getDate() === today.getDate()
}

export function checkSessionMilestone(
  totalVisits: number,
  lastMilestoneVisit: number
): number | null {
  for (const threshold of SESSION_MILESTONES) {
    if (totalVisits >= threshold && lastMilestoneVisit < threshold) {
      return threshold
    }
  }
  return null
}

export function checkAnniversary(
  membershipStartDate: string | null,
  lastMilestoneAnniversary: string | null
): string | null {
  if (!membershipStartDate) return null

  const start = new Date(membershipStartDate + 'T00:00:00')
  const now = new Date()

  const monthsDiff =
    (now.getFullYear() - start.getFullYear()) * 12 +
    (now.getMonth() - start.getMonth())

  // Check if today is approximately the anniversary day (within 1 day tolerance)
  const dayMatch = Math.abs(now.getDate() - start.getDate()) <= 1

  if (!dayMatch) return null

  for (const { months, label } of ANNIVERSARY_THRESHOLDS) {
    if (monthsDiff === months && lastMilestoneAnniversary !== label) {
      return label
    }
  }

  return null
}

export function checkInactivity(
  lastVisitDate: string | null,
  inactivityNotifiedDays: number
): InactivityTier | null {
  if (!lastVisitDate) return null

  const last = new Date(lastVisitDate)
  const now = new Date()
  const daysSince = Math.floor(
    (now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24)
  )

  // Find the highest tier the member qualifies for that hasn't been notified
  for (let i = INACTIVITY_TIERS.length - 1; i >= 0; i--) {
    const tier = INACTIVITY_TIERS[i]
    if (daysSince >= tier && inactivityNotifiedDays < tier) {
      return tier
    }
  }

  return null
}

// Reset inactivity when a member checks in
export function shouldResetInactivity(inactivityNotifiedDays: number): boolean {
  return inactivityNotifiedDays > 0
}
