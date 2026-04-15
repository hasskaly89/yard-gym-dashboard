import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSessionMilestone, shouldResetInactivity } from '@/lib/milestones/detect'
import { triggerMilestone } from '@/lib/milestones/trigger'
import { createOrSyncGHLContact } from '@/lib/ghl/api'

export async function POST(req: NextRequest) {
  const supabase = createAdminClient()

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const eventId = body.eventId ?? body.EventId ?? ''
  const eventData = body.eventData ?? body.EventData ?? body

  console.log(`[MB Webhook] Event: ${eventId}`, JSON.stringify(eventData).slice(0, 300))

  try {
    switch (eventId) {
      case 'classRosterBookingStatus.updated':
        await handleCheckIn(supabase, eventData)
        break

      case 'classRosterBooking.created':
        // Booking created — no action needed until check-in
        break

      case 'classRosterBooking.cancelled':
        // Could decrement count, but safer to just re-sync on next cron
        break

      case 'client.created':
        await handleNewClient(supabase, eventData)
        break

      case 'client.updated':
        await handleClientUpdate(supabase, eventData)
        break

      case 'client.deactivated':
      case 'clientMembershipAssignment.cancelled':
        await handleDeactivation(supabase, eventData)
        break

      default:
        // Test/manual webhook — treat as check-in if clientId present
        if (eventData.clientId || eventData.ClientId) {
          await handleCheckIn(supabase, eventData)
        }
    }

    return NextResponse.json({ ok: true, event: eventId })
  } catch (err: any) {
    console.error('[MB Webhook] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

async function handleCheckIn(supabase: any, data: any) {
  const clientId = String(data.clientId ?? data.ClientId ?? data.client?.Id ?? '')
  if (!clientId) return

  // Get current member
  const { data: member } = await supabase
    .from('members')
    .select('*')
    .eq('mindbody_client_id', clientId)
    .single()

  if (!member) {
    console.warn(`[MB Webhook] Unknown client ${clientId} — skipping`)
    return
  }

  const newCount = (member.total_visit_count ?? 0) + 1
  const now = new Date().toISOString()

  // Update visit count + date
  await supabase
    .from('members')
    .update({
      total_visit_count: newCount,
      last_visit_date: now,
      // Reset inactivity when they check in
      ...(shouldResetInactivity(member.inactivity_notified_days ?? 0) && {
        inactivity_notified_days: 0,
      }),
    })
    .eq('mindbody_client_id', clientId)

  // Check for session milestone
  const milestone = checkSessionMilestone(newCount, member.last_milestone_visit ?? 0)
  if (milestone) {
    console.log(`[Milestone] ${member.first_name} hit ${milestone} sessions!`)
    await triggerMilestone(member, 'session', String(milestone))
  }
}

async function handleNewClient(supabase: any, data: any) {
  const client = data.client ?? data.Client ?? data
  const clientId = String(client.Id ?? client.id ?? '')
  if (!clientId) return

  const row = {
    mindbody_client_id: clientId,
    first_name: client.FirstName ?? client.firstName ?? '',
    last_name: client.LastName ?? client.lastName ?? '',
    email: (client.Email ?? client.email ?? '').toLowerCase() || null,
    phone: client.MobilePhone ?? client.mobilePhone ?? null,
    birth_date: client.BirthDate ? client.BirthDate.split('T')[0] : null,
    membership_start_date: new Date().toISOString().split('T')[0],
    status: 'active',
    total_visit_count: 0,
    last_synced_at: new Date().toISOString(),
  }

  await supabase.from('members').upsert(row, { onConflict: 'mindbody_client_id' })

  // Create GHL contact
  const ghlId = await createOrSyncGHLContact(row)
  if (ghlId) {
    await supabase
      .from('members')
      .update({ ghl_contact_id: ghlId })
      .eq('mindbody_client_id', clientId)
  }
}

async function handleClientUpdate(supabase: any, data: any) {
  const client = data.client ?? data.Client ?? data
  const clientId = String(client.Id ?? client.id ?? '')
  if (!clientId) return

  const updates: Record<string, unknown> = {}
  if (client.FirstName) updates.first_name = client.FirstName
  if (client.LastName) updates.last_name = client.LastName
  if (client.Email) updates.email = client.Email.toLowerCase()
  if (client.MobilePhone) updates.phone = client.MobilePhone
  if (client.BirthDate) updates.birth_date = client.BirthDate.split('T')[0]

  if (Object.keys(updates).length > 0) {
    updates.last_synced_at = new Date().toISOString()
    await supabase
      .from('members')
      .update(updates)
      .eq('mindbody_client_id', clientId)
  }
}

async function handleDeactivation(supabase: any, data: any) {
  const clientId = String(
    data.clientId ?? data.ClientId ?? data.client?.Id ?? ''
  )
  if (!clientId) return

  await supabase
    .from('members')
    .update({ status: 'deactivated' })
    .eq('mindbody_client_id', clientId)
}
