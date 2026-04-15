import { createAdminClient } from '@/lib/supabase/admin'
import { addGHLTag, triggerGHLWebhook, createOrSyncGHLContact } from '@/lib/ghl/api'

export type MilestoneType = 'birthday' | 'session' | 'anniversary' | 'inactivity'

interface Member {
  mindbody_client_id: string
  first_name: string
  last_name: string
  email?: string | null
  phone?: string | null
  ghl_contact_id?: string | null
  total_visit_count?: number
  last_visit_date?: string | null
  membership_start_date?: string | null
}

const WEBHOOK_URLS: Record<MilestoneType, string> = {
  birthday: process.env.GHL_BIRTHDAY_WEBHOOK_URL ?? '',
  session: process.env.GHL_SESSION_WEBHOOK_URL ?? '',
  anniversary: process.env.GHL_ANNIVERSARY_WEBHOOK_URL ?? '',
  inactivity: process.env.GHL_INACTIVITY_WEBHOOK_URL ?? '',
}

const INACTIVITY_TAGS: Record<number, string> = {
  7: 'inactive-7d',
  14: 'inactive-14d',
  21: 'at-risk',
  30: 'churn-risk',
}

export async function triggerMilestone(
  member: Member,
  type: MilestoneType,
  value: string
): Promise<{ logged: boolean; ghlNotified: boolean }> {
  const supabase = createAdminClient()
  let ghlNotified = false

  // 1. Log milestone
  const { error: logError } = await supabase.from('milestone_log').insert({
    mindbody_client_id: member.mindbody_client_id,
    milestone_type: type,
    milestone_value: value,
  })

  if (logError) {
    console.error('[Milestone] Log insert failed:', logError.message)
    return { logged: false, ghlNotified: false }
  }

  // 2. Ensure GHL contact exists
  let contactId = member.ghl_contact_id
  if (!contactId) {
    contactId = await createOrSyncGHLContact(member)
    if (contactId) {
      await supabase
        .from('members')
        .update({ ghl_contact_id: contactId })
        .eq('mindbody_client_id', member.mindbody_client_id)
    }
  }

  // 3. Tag the GHL contact
  if (contactId) {
    try {
      const tag = buildTag(type, value)
      await addGHLTag(contactId, tag)
      ghlNotified = true
    } catch (err) {
      console.error('[Milestone] GHL tag failed:', err)
    }
  }

  // 4. Fire GHL webhook if configured
  const webhookUrl = WEBHOOK_URLS[type]
  if (webhookUrl) {
    try {
      await triggerGHLWebhook(webhookUrl, {
        name: `${member.first_name} ${member.last_name}`,
        firstName: member.first_name,
        lastName: member.last_name,
        email: member.email ?? '',
        phone: member.phone ?? '',
        milestone: type,
        value,
        mindbodyClientId: member.mindbody_client_id,
      })
      ghlNotified = true
    } catch (err) {
      console.error('[Milestone] Webhook failed:', err)
    }
  }

  // 5. Update milestone_log with notification status
  await supabase
    .from('milestone_log')
    .update({ ghl_notified: ghlNotified })
    .eq('mindbody_client_id', member.mindbody_client_id)
    .eq('milestone_type', type)
    .eq('milestone_value', value)
    .order('triggered_at', { ascending: false })
    .limit(1)

  // 6. Update member's milestone tracking fields
  const updates: Record<string, unknown> = {}
  if (type === 'session') updates.last_milestone_visit = parseInt(value)
  if (type === 'anniversary') updates.last_milestone_anniversary = value
  if (type === 'inactivity') updates.inactivity_notified_days = parseInt(value)

  if (Object.keys(updates).length > 0) {
    await supabase
      .from('members')
      .update(updates)
      .eq('mindbody_client_id', member.mindbody_client_id)
  }

  return { logged: true, ghlNotified }
}

function buildTag(type: MilestoneType, value: string): string {
  switch (type) {
    case 'birthday':
      return 'birthday-milestone'
    case 'session':
      return `milestone-${value}-sessions`
    case 'anniversary':
      return `anniversary-${value.replace(/\s/g, '-')}`
    case 'inactivity':
      return INACTIVITY_TAGS[parseInt(value)] ?? `inactive-${value}d`
  }
}
