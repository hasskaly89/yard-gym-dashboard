'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { calcTarget, WEEK_CONFIG, roundToPlate, isPR } from '@/lib/rig/weights'
import confetti from 'canvas-confetti'

const LIFTS = ['squat', 'bench', 'deadlift'] as const
type Lift = typeof LIFTS[number]

interface ThreeRM {
  lift: Lift
  weight_kg: number
}

interface LoggedLift {
  lift: Lift
  weight_kg: number
  reps: number
  is_pr: boolean
}

export default function RigLogPage() {
  const supabase = createClient()
  const [block, setBlock] = useState<any>(null)
  const [memberId, setMemberId] = useState<string | null>(null)
  const [threeRMs, setThreeRMs] = useState<ThreeRM[]>([])
  const [weekLifts, setWeekLifts] = useState<LoggedLift[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<Lift | null>(null)
  const [tab, setTab] = useState<'log' | '3rm'>('log')

  // Form state per lift
  const [weights, setWeights] = useState<Record<Lift, string>>({ squat: '', bench: '', deadlift: '' })
  const [rmInputs, setRmInputs] = useState<Record<Lift, string>>({ squat: '', bench: '', deadlift: '' })

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: m } = await supabase
      .from('rig_members')
      .select('id')
      .eq('email', user.email!)
      .single()

    if (!m) { setLoading(false); return }
    setMemberId(m.id)

    const { data: b } = await supabase
      .from('rig_blocks')
      .select('*')
      .eq('is_active', true)
      .single()

    setBlock(b)

    if (b) {
      const { data: rms } = await supabase
        .from('rig_member_maxes')
        .select('lift_id, rm3')
        .eq('member_id', m.id)
        .eq('block_id', b.id)

      setThreeRMs((rms as any[])?.map(r => ({ lift: r.lift_id, weight_kg: r.rm3 })) || [])

      const { data: lifts } = await supabase
        .from('rig_lift_results')
        .select('lift_id, actual_weight, reps_completed, is_pr')
        .eq('member_id', m.id)

      setWeekLifts((lifts as any[])?.map(l => ({ lift: l.lift_id, weight_kg: l.actual_weight, reps: l.reps_completed, is_pr: l.is_pr })) || [])
    }

    setLoading(false)
  }

  async function logLift(lift: Lift) {
    if (!block || !memberId) return
    const rawWeight = parseFloat(weights[lift])
    if (!rawWeight || rawWeight <= 0) return

    setSaving(lift)
    const weight = roundToPlate(rawWeight)
    const currentRM = threeRMs.find(r => r.lift === lift)?.weight_kg ?? 0
    const weekConfig = WEEK_CONFIG.find(w => w.week === block.current_week)!
    const pr = isPR(weight, currentRM)

    // Get lift id and block_week_id
    const { data: liftRow } = await supabase.from('rig_lifts').select('id').eq('slug', lift).single()
    const { data: weekRow } = await supabase.from('rig_block_weeks').select('id').eq('block_id', block.id).eq('week_number', block.current_week ?? 1).single()
    if (!liftRow || !weekRow) { setSaving(null); return }

    const { error } = await supabase.from('rig_lift_results').upsert({
      member_id: memberId,
      block_week_id: weekRow.id,
      lift_id: liftRow.id,
      actual_weight: weight,
      reps_completed: weekConfig.reps,
      is_pr: pr,
      logged_at: new Date().toISOString(),
    }, { onConflict: 'member_id,block_week_id,lift_id' })

    if (!error) {
      if (pr) {
        confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } })
        await supabase.from('rig_member_maxes').upsert({
          member_id: memberId,
          block_id: block.id,
          lift_id: liftRow.id,
          rm3: weight,
        }, { onConflict: 'member_id,block_id,lift_id' })
      }
      setWeights(prev => ({ ...prev, [lift]: '' }))
      await loadData()
    }

    setSaving(null)
  }

  async function saveRM(lift: Lift) {
    if (!block || !memberId) return
    const raw = parseFloat(rmInputs[lift])
    if (!raw || raw <= 0) return

    setSaving(lift)
    const weight = roundToPlate(raw)

    const { data: liftRow2 } = await supabase.from('rig_lifts').select('id').eq('slug', lift).single()
    if (!liftRow2) { setSaving(null); return }
    await supabase.from('rig_member_maxes').upsert({
      member_id: memberId,
      block_id: block.id,
      lift_id: liftRow2.id,
      rm3: weight,
    }, { onConflict: 'member_id,block_id,lift_id' })

    setRmInputs(prev => ({ ...prev, [lift]: '' }))
    await loadData()
    setSaving(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: '#FF5722', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  if (!block) {
    return (
      <div className="px-4 py-6 text-center">
        <p className="text-4xl mb-3">🏋️</p>
        <p className="font-semibold" style={{ color: '#1A1A1A' }}>No Active Block</p>
        <p className="text-sm mt-1" style={{ color: '#888888' }}>Your trainer will set up a training block soon.</p>
      </div>
    )
  }

  const weekConfig = WEEK_CONFIG.find(w => w.week === block.current_week)!

  return (
    <div className="px-4 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: '#1A1A1A' }}>Log Lifts</h1>
        <p className="text-sm mt-1" style={{ color: '#888888' }}>{block.name} · {weekConfig.label}</p>
      </div>

      {/* Tab */}
      <div className="flex rounded-xl p-1" style={{ backgroundColor: '#F3F2F0' }}>
        {(['log', '3rm'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all"
            style={{
              backgroundColor: tab === t ? '#FF5722' : 'transparent',
              color: tab === t ? 'white' : '#888888',
            }}
          >
            {t === 'log' ? 'Log Week' : 'Set 3RM'}
          </button>
        ))}
      </div>

      {tab === 'log' ? (
        <div className="space-y-4">
          {LIFTS.map(lift => {
            const rm = threeRMs.find(r => r.lift === lift)
            const target = rm ? calcTarget(rm.weight_kg, block.current_week) : null
            const logged = weekLifts.find(l => l.lift === lift)

            return (
              <div key={lift} className="bg-white rounded-2xl p-4 border" style={{ borderColor: '#E8E6E3' }}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-semibold capitalize text-lg" style={{ color: '#1A1A1A' }}>{lift}</p>
                    {target ? (
                      <p className="text-sm" style={{ color: '#888888' }}>
                        Target: <strong style={{ color: '#FF5722' }}>{target} kg</strong> × {weekConfig.reps}
                      </p>
                    ) : (
                      <p className="text-sm" style={{ color: '#888888' }}>Set your 3RM first</p>
                    )}
                  </div>
                  {logged && (
                    <div className="text-right">
                      <p className="font-bold" style={{ color: logged.is_pr ? '#FF5722' : '#1A1A1A' }}>
                        {logged.weight_kg} kg
                      </p>
                      {logged.is_pr && <p className="text-xs font-bold" style={{ color: '#FF5722' }}>PR!</p>}
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder="kg lifted"
                    value={weights[lift]}
                    onChange={e => setWeights(prev => ({ ...prev, [lift]: e.target.value }))}
                    className="flex-1 px-3 rounded-xl border outline-none"
                    style={{ height: '44px', borderColor: '#E8E6E3', backgroundColor: '#F8F7F5', color: '#1A1A1A', fontSize: '16px' }}
                  />
                  <button
                    onClick={() => logLift(lift)}
                    disabled={saving === lift || !weights[lift]}
                    className="px-4 rounded-xl font-semibold text-white text-sm"
                    style={{ height: '44px', backgroundColor: saving === lift ? '#FFB8A0' : '#FF5722', minWidth: '70px' }}
                  >
                    {saving === lift ? '...' : logged ? 'Update' : 'Log'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm" style={{ color: '#888888' }}>
            Enter your 3-rep max for each lift. Targets are calculated from these values.
          </p>
          {LIFTS.map(lift => {
            const current = threeRMs.find(r => r.lift === lift)
            return (
              <div key={lift} className="bg-white rounded-2xl p-4 border" style={{ borderColor: '#E8E6E3' }}>
                <div className="flex items-center justify-between mb-3">
                  <p className="font-semibold capitalize" style={{ color: '#1A1A1A' }}>{lift}</p>
                  {current && (
                    <p className="text-sm" style={{ color: '#888888' }}>
                      Current: <strong style={{ color: '#FF5722' }}>{current.weight_kg} kg</strong>
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder={current ? `${current.weight_kg} kg` : 'kg'}
                    value={rmInputs[lift]}
                    onChange={e => setRmInputs(prev => ({ ...prev, [lift]: e.target.value }))}
                    className="flex-1 px-3 rounded-xl border outline-none"
                    style={{ height: '44px', borderColor: '#E8E6E3', backgroundColor: '#F8F7F5', color: '#1A1A1A', fontSize: '16px' }}
                  />
                  <button
                    onClick={() => saveRM(lift)}
                    disabled={saving === lift || !rmInputs[lift]}
                    className="px-4 rounded-xl font-semibold text-white text-sm"
                    style={{ height: '44px', backgroundColor: saving === lift ? '#FFB8A0' : '#FF5722', minWidth: '70px' }}
                  >
                    {saving === lift ? '...' : 'Save'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
