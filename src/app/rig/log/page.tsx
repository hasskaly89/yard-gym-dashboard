'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { calcTarget, BLOCK_CONFIGS, WEEK_CONFIG, PHASE_COLORS, roundToPlate, isPR } from '@/lib/rig/weights'
import type { BlockType } from '@/lib/rig/weights'
import confetti from 'canvas-confetti'

const LIFTS = ['squat', 'bench', 'deadlift'] as const
type Lift = typeof LIFTS[number]

const LIFT_META: Record<Lift, { abbr: string; color: string }> = {
  squat:    { abbr: 'S', color: '#FF5722' },
  bench:    { abbr: 'B', color: '#8B5CF6' },
  deadlift: { abbr: 'D', color: '#3B82F6' },
}

interface ThreeRM { lift: Lift; weight_kg: number }
interface LoggedLift { lift: Lift; weight_kg: number; reps: number; is_pr: boolean }

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

export default function RigLogPage() {
  const supabase = createClient()
  const [block, setBlock] = useState<any>(null)
  const [memberId, setMemberId] = useState<string | null>(null)
  const [threeRMs, setThreeRMs] = useState<ThreeRM[]>([])
  const [weekLifts, setWeekLifts] = useState<LoggedLift[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<Lift | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [tab, setTab] = useState<'log' | '3rm'>('log')
  const [weights, setWeights] = useState<Record<Lift, string>>({ squat: '', bench: '', deadlift: '' })
  const [rmInputs, setRmInputs] = useState<Record<Lift, string>>({ squat: '', bench: '', deadlift: '' })

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: m } = await supabase
      .from('rig_members').select('id').eq('email', user.email!).single()
    if (!m) { setLoading(false); return }
    setMemberId(m.id)

    const { data: b } = await supabase
      .from('rig_blocks').select('*').eq('is_active', true).single()
    setBlock(b)

    if (b) {
      const { data: rms } = await supabase
        .from('rig_member_maxes')
        .select('rm3, rig_lifts!lift_id(slug)')
        .eq('member_id', m.id)
        .eq('block_id', b.id)

      setThreeRMs(
        (rms as any[])?.map(r => ({ lift: r.rig_lifts?.slug as Lift, weight_kg: r.rm3 }))
          .filter(r => r.lift) || []
      )

      const { data: lifts } = await supabase
        .from('rig_lift_results')
        .select('actual_weight, reps_completed, is_pr, rig_lifts!lift_id(slug)')
        .eq('member_id', m.id)

      setWeekLifts(
        (lifts as any[])?.map(l => ({
          lift: l.rig_lifts?.slug as Lift,
          weight_kg: l.actual_weight,
          reps: l.reps_completed,
          is_pr: l.is_pr,
        })).filter(l => l.lift) || []
      )
    }

    setLoading(false)
  }

  async function logLift(lift: Lift) {
    if (!block || !memberId) return
    const rawWeight = parseFloat(weights[lift])
    if (!rawWeight || rawWeight <= 0) return

    setSaving(lift)
    setSaveError(null)
    const weight = roundToPlate(rawWeight)
    const currentRM = threeRMs.find(r => r.lift === lift)?.weight_kg ?? 0
    const blockType = (block.block_type as BlockType) || 'signature'
    const blockCfg = BLOCK_CONFIGS[blockType]
    const weekCfg = blockCfg.weeks.find(w => w.week === block.current_week) ?? blockCfg.weeks[0]
    const pr = isPR(weight, currentRM)

    const { data: liftRow, error: liftErr } = await supabase
      .from('rig_lifts').select('id').eq('slug', lift).single()
    const { data: weekRow, error: weekErr } = await supabase
      .from('rig_block_weeks').select('id')
      .eq('block_id', block.id).eq('week_number', block.current_week ?? 1).single()

    if (!liftRow || !weekRow) {
      setSaveError(liftErr?.message || weekErr?.message || 'Could not find lift or week — contact your coach.')
      setSaving(null)
      return
    }

    const { error } = await supabase.from('rig_lift_results').upsert({
      member_id: memberId,
      block_week_id: weekRow.id,
      lift_id: liftRow.id,
      actual_weight: weight,
      reps_completed: weekCfg.reps,
      is_pr: pr,
      logged_at: new Date().toISOString(),
    }, { onConflict: 'member_id,block_week_id,lift_id' })

    if (error) { setSaveError(error.message); setSaving(null); return }

    if (pr) {
      confetti({ particleCount: 150, spread: 80, origin: { y: 0.5 } })
      await supabase.from('rig_member_maxes').upsert({
        member_id: memberId, block_id: block.id,
        lift_id: liftRow.id, rm3: weight,
      }, { onConflict: 'member_id,block_id,lift_id' })
    }

    setWeights(prev => ({ ...prev, [lift]: '' }))
    await loadData()
    setSaving(null)
  }

  async function saveRM(lift: Lift) {
    if (!block || !memberId) return
    const raw = parseFloat(rmInputs[lift])
    if (!raw || raw <= 0) return

    setSaving(lift)
    setSaveError(null)
    const weight = roundToPlate(raw)

    const { data: liftRow, error: liftErr } = await supabase
      .from('rig_lifts').select('id').eq('slug', lift).single()
    if (!liftRow) {
      setSaveError(liftErr?.message || `Could not find lift "${lift}".`)
      setSaving(null)
      return
    }

    const { error } = await supabase.from('rig_member_maxes').upsert({
      member_id: memberId, block_id: block.id,
      lift_id: liftRow.id, rm3: weight,
    }, { onConflict: 'member_id,block_id,lift_id' })

    if (error) { setSaveError(error.message); setSaving(null); return }

    setRmInputs(prev => ({ ...prev, [lift]: '' }))
    await loadData()
    setSaving(null)
  }

  // ─── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="w-8 h-8 rounded-full border-2 animate-spin"
          style={{ borderColor: '#FF5722', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  if (!block) {
    return (
      <div className="px-4 py-6 text-center">
        <div className="w-20 h-20 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ backgroundColor: '#F3F2F0' }}>
          <span className="text-4xl">🏋️</span>
        </div>
        <p className="font-bold text-lg" style={{ color: '#1A1A1A' }}>No Active Block</p>
        <p className="text-sm mt-1" style={{ color: '#888888' }}>Your trainer will set up a training block soon.</p>
      </div>
    )
  }

  // ─── Derived state ─────────────────────────────────────────────────────────
  const blockType = (block.block_type as BlockType) || 'signature'
  const blockCfg = BLOCK_CONFIGS[blockType]
  const weekCfg = blockCfg.weeks.find(w => w.week === block.current_week) ?? blockCfg.weeks[0]
  const phaseColor = PHASE_COLORS[weekCfg.phase]
  const totalWeeks = blockCfg.durationWeeks
  const loggedCount = LIFTS.filter(l => weekLifts.find(wl => wl.lift === l)).length
  const allDone = loggedCount === LIFTS.length

  return (
    <div className="px-4 py-5 space-y-4">

      {/* ── Hero card ───────────────────────────────────────────────────────── */}
      <div className="rounded-2xl p-5 text-white relative overflow-hidden" style={{ backgroundColor: '#1A1A1A' }}>
        {/* Phase glow */}
        <div className="absolute top-0 right-0 w-48 h-48 rounded-full blur-3xl pointer-events-none"
          style={{ backgroundColor: phaseColor, opacity: 0.15, transform: 'translate(40%, -40%)' }} />

        <div className="flex items-start justify-between mb-3 relative">
          <p className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'rgba(255,255,255,0.5)' }}>
            {block.name}
          </p>
          <span className="text-xs font-bold px-2.5 py-1 rounded-full"
            style={{ backgroundColor: phaseColor + '28', color: phaseColor, border: `1px solid ${phaseColor}40` }}>
            {weekCfg.phase}
          </span>
        </div>

        <div className="relative mb-4">
          <p className="text-2xl font-black tracking-tight">{weekCfg.label}</p>
          <p className="text-sm mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>
            {weekCfg.reps} reps · {Math.round(weekCfg.pct * 100)}% intensity
          </p>
        </div>

        {/* Week progress */}
        <div className="flex items-center gap-1.5 relative">
          {Array.from({ length: totalWeeks }).map((_, i) => {
            const weekNum = i + 1
            const isPast = weekNum < block.current_week
            const isCurrent = weekNum === block.current_week
            return (
              <div key={i} className="rounded-full transition-all duration-300"
                style={{
                  width: isCurrent ? 22 : 8,
                  height: 8,
                  backgroundColor: isPast || isCurrent ? phaseColor : 'rgba(255,255,255,0.15)',
                  opacity: isPast ? 0.5 : 1,
                }}
              />
            )
          })}
          <p className="ml-auto text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {block.current_week} / {totalWeeks}
          </p>
        </div>
      </div>

      {/* ── Tab switcher ────────────────────────────────────────────────────── */}
      <div className="flex rounded-xl p-1 gap-1" style={{ backgroundColor: '#F3F2F0' }}>
        {(['log', '3rm'] as const).map(t => (
          <button key={t}
            onClick={() => { setTab(t); setSaveError(null) }}
            className="flex-1 py-2 rounded-lg text-sm font-bold transition-all"
            style={{
              backgroundColor: tab === t ? '#FF5722' : 'transparent',
              color: tab === t ? 'white' : '#888888',
              boxShadow: tab === t ? '0 2px 8px rgba(255,87,34,0.35)' : 'none',
            }}
          >
            {t === 'log' ? 'Log Week' : 'Set 3RM'}
          </button>
        ))}
      </div>

      {/* ── Error banner ────────────────────────────────────────────────────── */}
      {saveError && (
        <div className="rounded-xl px-4 py-3 text-sm font-medium flex items-start gap-2"
          style={{ backgroundColor: '#FFF0EB', color: '#CC3300', border: '1px solid #FFCAB8' }}>
          <span className="mt-0.5 flex-shrink-0">⚠️</span>
          <span>{saveError}</span>
        </div>
      )}

      {/* ── LOG TAB ─────────────────────────────────────────────────────────── */}
      {tab === 'log' && (
        <div className="space-y-3">

          {/* Progress row */}
          <div className="flex items-center justify-between px-1">
            <p className="text-sm font-bold" style={{ color: '#1A1A1A' }}>Today&apos;s Lifts</p>
            {allDone ? (
              <span className="text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1"
                style={{ backgroundColor: '#ECFDF5', color: '#16A34A' }}>
                <span>✓</span> All done
              </span>
            ) : (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
                style={{ backgroundColor: '#F3F2F0', color: '#888888' }}>
                {loggedCount} of {LIFTS.length}
              </span>
            )}
          </div>

          {/* All done celebration */}
          {allDone && (
            <div className="rounded-2xl p-4 flex items-center gap-3"
              style={{ backgroundColor: '#ECFDF5', border: '1px solid #BBF7D0' }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: '#22C55E' }}>
                <CheckIcon />
              </div>
              <div>
                <p className="font-bold text-sm" style={{ color: '#15803D' }}>Session complete 💪</p>
                <p className="text-xs mt-0.5" style={{ color: '#16A34A' }}>All lifts logged. Great work this week.</p>
              </div>
            </div>
          )}

          {LIFTS.map(lift => {
            const rm = threeRMs.find(r => r.lift === lift)
            const target = rm ? calcTarget(rm.weight_kg, block.current_week, blockType) : null
            const logged = weekLifts.find(l => l.lift === lift)
            const meta = LIFT_META[lift]
            const pct = rm && (logged?.weight_kg ?? target)
              ? Math.round(((logged?.weight_kg ?? target ?? 0) / rm.weight_kg) * 100)
              : null

            return (
              <div key={lift} className="bg-white rounded-2xl border overflow-hidden"
                style={{ borderColor: logged ? (logged.is_pr ? '#FFCAB8' : '#D1FAE5') : '#E8E6E3' }}>

                {/* Top row */}
                <div className="px-4 pt-4">
                  <div className="flex items-center gap-3">
                    {/* Badge */}
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 font-black text-white text-base transition-colors"
                      style={{ backgroundColor: logged ? (logged.is_pr ? '#FF5722' : '#22C55E') : meta.color }}>
                      {logged ? <CheckIcon /> : meta.abbr}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="font-bold capitalize" style={{ color: '#1A1A1A' }}>{lift}</p>
                      {target ? (
                        <p className="text-sm" style={{ color: '#888888' }}>
                          Target <strong style={{ color: '#FF5722' }}>{target} kg</strong>
                          <span style={{ color: '#BBBBBB' }}> × {weekCfg.reps}</span>
                        </p>
                      ) : (
                        <p className="text-sm" style={{ color: '#BBBBBB' }}>Set your 3RM to unlock target</p>
                      )}
                    </div>

                    {logged && (
                      <div className="text-right flex-shrink-0 ml-2">
                        <p className="text-xl font-black"
                          style={{ color: logged.is_pr ? '#FF5722' : '#1A1A1A', lineHeight: 1.1 }}>
                          {logged.weight_kg}
                          <span className="text-sm font-semibold ml-0.5" style={{ color: '#888888' }}>kg</span>
                        </p>
                        {logged.is_pr ? (
                          <span className="text-xs font-bold" style={{ color: '#FF5722' }}>NEW PR 🔥</span>
                        ) : pct ? (
                          <p className="text-xs font-semibold" style={{ color: '#888888' }}>{pct}%</p>
                        ) : null}
                      </div>
                    )}
                  </div>

                  {/* Intensity bar */}
                  {pct !== null && (
                    <div className="mt-3 mb-1">
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: '#F3F2F0' }}>
                        <div className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${Math.min(pct, 110)}%`,
                            backgroundColor: logged?.is_pr ? '#FF5722' : logged ? '#22C55E' : '#E0DFDC',
                          }}
                        />
                      </div>
                      <p className="text-xs mt-1 font-medium" style={{ color: '#BBBBBB' }}>
                        {pct}% of 3RM
                      </p>
                    </div>
                  )}
                </div>

                {/* Input row */}
                <div className="px-4 pb-4 pt-3 flex gap-2">
                  <input
                    type="number"
                    inputMode="decimal"
                    placeholder={logged ? `${logged.weight_kg} kg` : target ? `${target} kg` : 'kg lifted'}
                    value={weights[lift]}
                    onChange={e => setWeights(prev => ({ ...prev, [lift]: e.target.value }))}
                    className="flex-1 px-3 rounded-xl border outline-none font-semibold"
                    style={{ height: '46px', borderColor: '#E8E6E3', backgroundColor: '#F8F7F5', color: '#1A1A1A', fontSize: '16px' }}
                  />
                  <button
                    onClick={() => logLift(lift)}
                    disabled={saving === lift || !weights[lift]}
                    className="rounded-xl font-bold text-white text-sm transition-all"
                    style={{
                      height: '46px',
                      minWidth: '84px',
                      paddingLeft: 20,
                      paddingRight: 20,
                      backgroundColor: saving === lift
                        ? '#FFB8A0'
                        : logged ? '#1A1A1A' : '#FF5722',
                      opacity: !weights[lift] && saving !== lift ? 0.45 : 1,
                      boxShadow: weights[lift] && !saving ? '0 2px 10px rgba(255,87,34,0.3)' : 'none',
                    }}
                  >
                    {saving === lift ? '...' : logged ? 'Update' : 'Log it'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── 3RM TAB ─────────────────────────────────────────────────────────── */}
      {tab === '3rm' && (
        <div className="space-y-3">
          <div className="px-1">
            <p className="text-sm font-bold" style={{ color: '#1A1A1A' }}>Your 3-Rep Maxes</p>
            <p className="text-sm mt-0.5" style={{ color: '#888888' }}>
              All weekly targets are calculated from these numbers.
            </p>
          </div>

          {LIFTS.map(lift => {
            const current = threeRMs.find(r => r.lift === lift)
            const meta = LIFT_META[lift]
            return (
              <div key={lift} className="bg-white rounded-2xl border" style={{ borderColor: '#E8E6E3' }}>
                <div className="px-4 pt-4 pb-3 flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 font-black text-white text-base"
                    style={{ backgroundColor: meta.color }}>
                    {meta.abbr}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold capitalize" style={{ color: '#1A1A1A' }}>{lift}</p>
                    {current ? (
                      <p className="text-sm" style={{ color: '#888888' }}>
                        Current 3RM
                      </p>
                    ) : (
                      <p className="text-sm" style={{ color: '#BBBBBB' }}>Not set yet</p>
                    )}
                  </div>
                  {current ? (
                    <div className="text-right flex-shrink-0">
                      <p className="font-black" style={{ color: '#1A1A1A', fontSize: 28, lineHeight: 1 }}>
                        {current.weight_kg}
                      </p>
                      <p className="text-xs font-bold" style={{ color: '#888888' }}>kg</p>
                    </div>
                  ) : (
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
                      style={{ backgroundColor: '#FFF0EB', color: '#FF5722' }}>
                      Set now
                    </span>
                  )}
                </div>

                <div className="px-4 pb-4 flex gap-2">
                  <input
                    type="number"
                    inputMode="decimal"
                    placeholder={current ? `Update (${current.weight_kg} kg)` : 'Enter 3RM in kg'}
                    value={rmInputs[lift]}
                    onChange={e => setRmInputs(prev => ({ ...prev, [lift]: e.target.value }))}
                    className="flex-1 px-3 rounded-xl border outline-none font-semibold"
                    style={{ height: '46px', borderColor: '#E8E6E3', backgroundColor: '#F8F7F5', color: '#1A1A1A', fontSize: '16px' }}
                  />
                  <button
                    onClick={() => saveRM(lift)}
                    disabled={saving === lift || !rmInputs[lift]}
                    className="rounded-xl font-bold text-white text-sm transition-all"
                    style={{
                      height: '46px',
                      minWidth: '84px',
                      paddingLeft: 20,
                      paddingRight: 20,
                      backgroundColor: saving === lift ? '#FFB8A0' : '#FF5722',
                      opacity: !rmInputs[lift] && saving !== lift ? 0.45 : 1,
                      boxShadow: rmInputs[lift] && !saving ? '0 2px 10px rgba(255,87,34,0.3)' : 'none',
                    }}
                  >
                    {saving === lift ? '...' : current ? 'Update' : 'Save'}
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
