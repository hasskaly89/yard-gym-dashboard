'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const C = {
  bg:     '#0F0E1F',
  card:   '#1A1830',
  border: 'rgba(255,255,255,0.07)',
  orange: '#FF5C3E',
  white:  '#FFFFFF',
  dim:    'rgba(255,255,255,0.45)',
  green:  '#00C896',
}

interface Props {
  email: string
  memberId: string
  existingFirst?: string
  existingLast?: string
}

export default function ProfileSetupClient({ email, memberId, existingFirst, existingLast }: Props) {
  const [firstName, setFirstName] = useState(existingFirst ?? '')
  const [lastName, setLastName] = useState(existingLast ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  async function save() {
    if (!firstName.trim()) { setError('Please enter your first name'); return }
    setSaving(true)
    setError('')

    const supabase = createClient()
    const { error: dbErr } = await supabase
      .from('rig_members')
      .update({ first_name: firstName.trim(), last_name: lastName.trim() })
      .eq('id', memberId)

    if (dbErr) {
      // Try via API route as fallback
      const res = await fetch('/api/rig/update-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId, firstName: firstName.trim(), lastName: lastName.trim() }),
      })
      if (!res.ok) { setError('Could not save — please try again'); setSaving(false); return }
    }

    // Also update user metadata so name is in auth
    await supabase.auth.updateUser({
      data: { first_name: firstName.trim(), last_name: lastName.trim() },
    })

    router.refresh()
  }

  return (
    <div style={{ minHeight: '80vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 24px' }}>

      {/* Icon */}
      <div style={{
        width: 72, height: 72, borderRadius: '50%',
        background: `linear-gradient(135deg, ${C.orange}33, ${C.orange}11)`,
        border: `2px solid ${C.orange}55`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 32, marginBottom: 24,
      }}>
        🏋️
      </div>

      <h1 style={{ color: C.white, fontSize: 26, fontWeight: 900, margin: '0 0 8px', textAlign: 'center', letterSpacing: -0.5 }}>
        Welcome to RIG
      </h1>
      <p style={{ color: C.dim, fontSize: 14, marginBottom: 36, textAlign: 'center', lineHeight: 1.5 }}>
        Set up your profile to get started.<br />
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)' }}>{email}</span>
      </p>

      {/* Form */}
      <div style={{ width: '100%', maxWidth: 360 }}>
        {/* First name */}
        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.dim, marginBottom: 8 }}>
          First Name *
        </label>
        <input
          type="text"
          placeholder="Jane"
          value={firstName}
          onChange={e => setFirstName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && save()}
          style={{
            width: '100%', height: 52, background: C.card,
            border: `1.5px solid ${error && !firstName ? C.orange : 'rgba(255,255,255,0.1)'}`,
            borderRadius: 14, padding: '0 16px', color: C.white,
            fontSize: 16, outline: 'none', boxSizing: 'border-box', marginBottom: 16,
          }}
        />

        {/* Last name */}
        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.dim, marginBottom: 8 }}>
          Last Name
        </label>
        <input
          type="text"
          placeholder="Smith"
          value={lastName}
          onChange={e => setLastName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && save()}
          style={{
            width: '100%', height: 52, background: C.card,
            border: '1.5px solid rgba(255,255,255,0.1)',
            borderRadius: 14, padding: '0 16px', color: C.white,
            fontSize: 16, outline: 'none', boxSizing: 'border-box', marginBottom: 24,
          }}
        />

        {error && (
          <p style={{ color: '#FF6B6B', fontSize: 13, marginBottom: 16, textAlign: 'center' }}>{error}</p>
        )}

        <button
          onClick={save}
          disabled={saving}
          style={{
            width: '100%', height: 54,
            background: saving ? `${C.orange}88` : C.orange,
            border: 'none', borderRadius: 14,
            color: '#fff', fontSize: 16, fontWeight: 700,
            cursor: saving ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s',
          }}
        >
          {saving ? 'Saving...' : "Let's Go →"}
        </button>
      </div>
    </div>
  )
}
