'use client'

import { useEffect, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'

interface MilestoneLog {
  id: string
  mindbody_client_id: string
  milestone_type: string
  milestone_value: string
  triggered_at: string
  ghl_notified: boolean
  members?: { first_name: string; last_name: string }
}

interface AtRiskMember {
  mindbody_client_id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  last_visit_date: string
  total_visit_count: number
  inactivity_notified_days: number
}

interface UpcomingBirthday {
  mindbody_client_id: string
  first_name: string
  last_name: string
  birth_date: string
}

interface DashboardData {
  todayMilestones: MilestoneLog[]
  recentActivity: MilestoneLog[]
  atRiskMembers: AtRiskMember[]
  monthlyMilestoneCount: number
  upcomingBirthdays: UpcomingBirthday[]
  atRiskCount: number
}

const MILESTONE_COLORS: Record<string, string> = {
  birthday: 'bg-pink-500/20 text-pink-400',
  session: 'bg-green-500/20 text-green-400',
  anniversary: 'bg-blue-500/20 text-blue-400',
  inactivity: 'bg-amber-500/20 text-amber-400',
}

const MILESTONE_ICONS: Record<string, string> = {
  birthday: '🎂',
  session: '💪',
  anniversary: '🏆',
  inactivity: '⚠️',
}

export default function MilestonesPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/milestones')
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-gym-text mb-2">Milestones</h1>
        <p className="text-gym-text-secondary text-sm">Loading...</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-gym-text mb-2">Milestones</h1>
        <p className="text-gym-text-secondary text-sm">
          Failed to load milestone data
        </p>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gym-text">Milestones</h1>
        <p className="text-gym-text-secondary text-sm mt-1">
          Member milestones, birthdays, anniversaries &amp; retention alerts
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Today's Milestones"
          value={data.todayMilestones.length}
          sub="Birthdays, sessions & anniversaries"
        />
        <StatCard
          label="This Month"
          value={data.monthlyMilestoneCount}
          sub="Total milestones triggered"
        />
        <StatCard
          label="At-Risk Members"
          value={data.atRiskCount}
          sub="14+ days inactive"
          accent={data.atRiskCount > 0}
        />
        <StatCard
          label="Upcoming Birthdays"
          value={data.upcomingBirthdays.length}
          sub="Next 7 days"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Today's Milestones */}
        <div className="bg-gym-surface border border-gym-border rounded-xl p-6">
          <h2 className="text-gym-text font-semibold mb-4">
            Today&apos;s Milestones
          </h2>
          {data.todayMilestones.length === 0 ? (
            <p className="text-gym-muted text-sm">No milestones today yet</p>
          ) : (
            <div className="space-y-3">
              {data.todayMilestones.map((m) => (
                <MilestoneRow key={m.id} milestone={m} />
              ))}
            </div>
          )}
        </div>

        {/* Upcoming Birthdays */}
        <div className="bg-gym-surface border border-gym-border rounded-xl p-6">
          <h2 className="text-gym-text font-semibold mb-4">
            Upcoming Birthdays
          </h2>
          {data.upcomingBirthdays.length === 0 ? (
            <p className="text-gym-muted text-sm">
              No birthdays in the next 7 days
            </p>
          ) : (
            <div className="space-y-3">
              {data.upcomingBirthdays.map((m) => (
                <div
                  key={m.mindbody_client_id}
                  className="flex items-center gap-3 p-3 rounded-lg bg-gym-bg"
                >
                  <span className="text-lg">🎂</span>
                  <div>
                    <p className="text-gym-text text-sm font-medium">
                      {m.first_name} {m.last_name}
                    </p>
                    <p className="text-gym-muted text-xs">
                      {formatBirthday(m.birth_date)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* At-Risk Members */}
        <div className="bg-gym-surface border border-gym-border rounded-xl p-6">
          <h2 className="text-gym-text font-semibold mb-4">
            At-Risk Members
          </h2>
          {data.atRiskMembers.length === 0 ? (
            <p className="text-gym-muted text-sm">
              No at-risk members — everyone&apos;s showing up
            </p>
          ) : (
            <div className="space-y-3">
              {data.atRiskMembers.map((m) => (
                <div
                  key={m.mindbody_client_id}
                  className="flex items-center justify-between p-3 rounded-lg bg-gym-bg"
                >
                  <div>
                    <p className="text-gym-text text-sm font-medium">
                      {m.first_name} {m.last_name}
                    </p>
                    <p className="text-gym-muted text-xs">
                      {m.total_visit_count} total sessions
                      {m.phone && ` · ${m.phone}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <InactivityBadge lastVisit={m.last_visit_date} />
                    <p className="text-gym-muted text-xs mt-1">
                      Last seen{' '}
                      {formatDistanceToNow(new Date(m.last_visit_date), {
                        addSuffix: true,
                      })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="bg-gym-surface border border-gym-border rounded-xl p-6">
          <h2 className="text-gym-text font-semibold mb-4">Recent Activity</h2>
          {data.recentActivity.length === 0 ? (
            <p className="text-gym-muted text-sm">
              No milestone activity yet
            </p>
          ) : (
            <div className="space-y-3">
              {data.recentActivity.map((m) => (
                <MilestoneRow key={m.id} milestone={m} showTime />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: number
  sub: string
  accent?: boolean
}) {
  return (
    <div className="bg-gym-surface border border-gym-border rounded-xl p-5">
      <p className="text-gym-muted text-xs font-semibold uppercase tracking-wider mb-2">
        {label}
      </p>
      <p
        className={`text-3xl font-bold mb-1 ${
          accent ? 'text-amber-400' : 'text-gym-text'
        }`}
      >
        {value}
      </p>
      <p className="text-gym-muted text-xs">{sub}</p>
    </div>
  )
}

function MilestoneRow({
  milestone,
  showTime,
}: {
  milestone: MilestoneLog
  showTime?: boolean
}) {
  const name = milestone.members
    ? `${milestone.members.first_name} ${milestone.members.last_name}`
    : `Member #${milestone.mindbody_client_id}`

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-gym-bg">
      <span className="text-lg">
        {MILESTONE_ICONS[milestone.milestone_type] ?? '🏅'}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-gym-text text-sm font-medium">{name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              MILESTONE_COLORS[milestone.milestone_type] ?? 'bg-gym-border text-gym-muted'
            }`}
          >
            {milestone.milestone_type}
          </span>
          <span className="text-gym-muted text-xs">
            {formatMilestoneValue(
              milestone.milestone_type,
              milestone.milestone_value
            )}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {milestone.ghl_notified && (
          <span className="text-xs text-green-400" title="GHL notified">
            ✓ GHL
          </span>
        )}
        {showTime && (
          <span className="text-gym-muted text-xs">
            {formatDistanceToNow(new Date(milestone.triggered_at), {
              addSuffix: true,
            })}
          </span>
        )}
      </div>
    </div>
  )
}

function InactivityBadge({ lastVisit }: { lastVisit: string }) {
  const days = Math.floor(
    (Date.now() - new Date(lastVisit).getTime()) / (1000 * 60 * 60 * 24)
  )
  const color =
    days >= 30
      ? 'bg-red-500/20 text-red-400'
      : days >= 21
        ? 'bg-orange-500/20 text-orange-400'
        : 'bg-amber-500/20 text-amber-400'

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${color}`}>
      {days}d inactive
    </span>
  )
}

function formatMilestoneValue(type: string, value: string): string {
  switch (type) {
    case 'birthday':
      return 'Happy Birthday!'
    case 'session':
      return `${value} sessions`
    case 'anniversary':
      return value
    case 'inactivity':
      return `${value} days inactive`
    default:
      return value
  }
}

function formatBirthday(dateStr: string): string {
  const bd = new Date(dateStr + 'T00:00:00')
  return bd.toLocaleDateString('en-AU', { month: 'long', day: 'numeric' })
}
