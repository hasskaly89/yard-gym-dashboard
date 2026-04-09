'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { calcTarget, BLOCK_CONFIGS, PHASE_COLORS, roundToPlate, isPR } from '@/lib/rig/weights'
import type { BlockType } from '@/lib/rig/weights'
import confetti from 'canvas-confetti'

const LIFTS = ['squat', 'bench', 'deadlift'] as const
type Lift = typeof LIFTS[number]

const LIFT_META: Record<Lift, { label: string; abbr: string; hue: string }> = {
  squat:    { label: 'Squat',    abbr: 'S', hue: '#FF5C3E' },
  bench:    { label: 'Bench',    abbr: 'B', hue: '#7C6FFF' },
  deadlift: { label: 'Deadlift', abbr: 'D', hue: '#00C9A7' },
}

const C = {
  bg:       '#0F0E1F',
  card:     '#1A1830',
  cardAlt:  '#201E38',
  border:   'rgba(255,255,255,0.07)',
  borderHi: 'rgba(255,255,255,0.13)',
  orange:   '#FF5C3E',
  white:    '#FFFFFF',
  dim:      'rgba(255,255,255,0.45)',
  dimmer:   'rgba(255,255,255,0.22)',
  inputBg:  'rgba(255,255,255,0.06)',
  inputBdr: 'rgba(255,255,255,0.14)',
  green:    '#00C896',
}

interface ThreeRM { lift: Lift; weight_kg: number }
interface LoggedLift { lift: Lift; weight_kg: number; reps: number; is_pr: boolean }
interface HistoryEntry { weight: number; date: string; reps: number | null }

function Tick({ size = 16, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none"
      stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null
  const W = 80, H = 28
  const min = Math.min(...data), max = Math.max(...data)
  const range = max - min || 1
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * W},${H - 4 - ((v - min) / range) * (H - 8)}`).join(' ')
  const lastPt = pts.split(' ').pop()!
  const [lx, ly] = lastPt.split(',').map(Number)
  return (
    <svg width={W} height={H} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity={0.5} />
      <circle cx={lx} cy={ly} r={3} fill={color} />
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
  const [unit, setUnit] = useState<'kg' | 'lb'>('kg')
  const [liftHistory, setLiftHistory] = useState<Record<Lift, HistoryEntry[]>>({ squat: [], bench: [], deadlift: [] })
  const [showHistory, setShowHistory] = useState<Record<Lift, boolean>>({ squat: false, bench: false, deadlift: false })

  // Convert kg → display unit
  function toDisplay(kg: number): number {
    return unit === 'lb' ? Math.round(kg * 2.205) : kg
  }

  // Convert display unit → kg
  function fromDisplay(val: number): number {
    if (unit === 'lb') {
      return Math.round((val / 2.205) * 2) / 2
    }
    return roundToPlate(val)
  }

  useEffect(() => {
    const saved = localStorage.getItem('rig_unit')
    if (saved === 'lb') setUnit('lb')
    loadData()
  }, [])

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

    // Fetch performance history
    const { data: histData } = await supabase
      .from('rig_lift_results')
      .select('actual_weight, reps_completed, logged_at, rig_lifts!lift_id(slug)')
      .eq('member_id', m.id)
      .order('logged_at', { ascending: true })
      .limit(60)
    const histMap: Record<Lift, HistoryEntry[]> = { squat: [], bench: [], deadlift: [] }
    for (const h of (histData as any[] || [])) {
      const slug = (h.rig_lifts as any)?.slug as Lift
      if (slug && histMap[slug]) {
        histMap[slug].push({ weight: h.actual_weight, date: h.logged_at, reps: h.reps_completed ?? null })
      }
    }
    setLiftHistory(histMap)

    setLoading(false)
  }

  async function logLift(lift: Lift) {
    if (!block || !memberId) return
    const rawDisplayWeight = parseFloat(weights[lift])
    if (!rawDisplayWeight || rawDisplayWeight <= 0) return

    setSaving(lift); setSaveError(null)

    // Convert from display unit back to kg before saving
    const weightKg = fromDisplay(rawDisplayWeight)
    const weight = roundToPlate(weightKg)

    const currentRM = threeRMs.find(r => r.lift === lift)?.weight_kg ?? 0
    const blockType = (block.block_type as BlockType) || 'signature'
    const wkCfg = BLOCK_CONFIGS[blockType].weeks.find(w => w.week === block.current_week) ?? BLOCK_CONFIGS[blockType].weeks[0]
    const pr = isPR(weight, currentRM)

    const { data: liftRow, error: liftErr } = await supabase.from('rig_lifts').select('id').eq('slug', lift).single()
    const { data: weekRow, error: weekErr } = await supabase.from('rig_block_weeks').select('id')
      .eq('block_id', block.id).eq('week_number', block.current_week ?? 1).single()

    if (!liftRow || !weekRow) {
      setSaveError(liftErr?.message || weekErr?.message || 'Could not find lift or week.')
      setSaving(null); return
    }

    const { error } = await supabase.from('rig_lift_results').upsert({
      member_id: memberId, block_week_id: weekRow.id, lift_id: liftRow.id,
      actual_weight: weight, reps_completed: wkCfg.reps, is_pr: pr,
      logged_at: new Date().toISOString(),
    }, { onConflict: 'member_id,block_week_id,lift_id' })

    if (error) { setSaveError(error.message); setSaving(null); return }

    if (pr) {
      confetti({ particleCount: 150, spread: 80, origin: { y: 0.5 } })
      await supabase.from('rig_member_maxes').upsert({
        member_id: memberId, block_id: block.id, lift_id: liftRow.id, rm3: weight,
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

    setSaving(lift); setSaveError(null)

    // Convert from display unit back to kg before saving
    const weightKg = fromDisplay(raw)
    const weight = roundToPlate(weightKg)

    const { data: liftRow, error: liftErr } = await supabase.from('rig_lifts').select('id').eq('slug', lift).single()
    if (!liftRow) { setSaveError(liftErr?.message || `Could not find "${lift}".`); setSaving(null); return }

    const { error } = await supabase.from('rig_member_maxes').upsert({
      member_id: memberId, block_id: block.id, lift_id: liftRow.id, rm3: weight,
    }, { onConflict: 'member_id,block_id,lift_id' })

    if (error) { setSaveError(error.message); setSaving(null); return }

    setRmInputs(prev => ({ ...prev, [lift]: '' }))
    await loadData()
    setSaving(null)
  }

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ minHeight: '60vh' }}
        className="flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 animate-spin"
          style={{ borderColor: C.orange, borderTopColor: 'transparent' }} />
      </div>
    )
  }

  if (!block) {
    return (
      <div style={{ minHeight: '60vh' }}
        className="flex flex-col items-center justify-center gap-3 text-center px-8">
        <div className="text-5xl mb-2">🏋️</div>
        <p className="font-black text-xl" style={{ color: C.white }}>No Active Block</p>
        <p className="text-sm" style={{ color: C.dim }}>Your trainer will set up a training block soon.</p>
      </div>
    )
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const blockType = (block.block_type as BlockType) || 'signature'
  const blockCfg  = BLOCK_CONFIGS[blockType]
  const weekCfg   = blockCfg.weeks.find(w => w.week === block.current_week) ?? blockCfg.weeks[0]
  const phaseColor = PHASE_COLORS[weekCfg.phase]
  const totalWeeks = blockCfg.durationWeeks
  const loggedCount = LIFTS.filter(l => weekLifts.find(wl => wl.lift === l)).length
  const allDone = loggedCount === LIFTS.length
  const unitLabel = unit

  return (
    <div style={{ padding: '24px 16px 8px' }}>

      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-bold tracking-widest uppercase" style={{ color: C.dim }}>
            {block.name}
          </p>
          <div className="flex items-center gap-2">
            {/* Unit toggle pill */}
            <button
              onClick={() => {
                const next = unit === 'kg' ? 'lb' : 'kg'
                setUnit(next)
                localStorage.setItem('rig_unit', next)
              }}
              style={{
                padding: '4px 12px', borderRadius: 99, fontSize: 11, fontWeight: 700,
                backgroundColor: 'rgba(255,255,255,0.07)', color: C.dim,
                border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer',
              }}
            >
              {unit === 'kg' ? 'kg → lb' : 'lb → kg'}
            </button>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full"
              style={{ backgroundColor: phaseColor + '22', color: phaseColor, border: `1px solid ${phaseColor}44` }}>
              {weekCfg.phase}
            </span>
          </div>
        </div>

        <h1 className="font-black text-2xl leading-tight" style={{ color: C.white }}>
          {weekCfg.label}
        </h1>
        <p className="text-sm mt-0.5" style={{ color: C.dim }}>
          {Math.round(weekCfg.pct * 100)}% intensity · {weekCfg.reps} reps
        </p>

        {/* Week dots */}
        <div className="flex items-center gap-1.5 mt-3">
          {Array.from({ length: totalWeeks }).map((_, i) => {
            const wk = i + 1
            return (
              <div key={i} className="rounded-full transition-all duration-300"
                style={{
                  width: wk === block.current_week ? 24 : 8, height: 8,
                  backgroundColor: wk <= block.current_week ? phaseColor : 'rgba(255,255,255,0.12)',
                  opacity: wk < block.current_week ? 0.45 : 1,
                }}
              />
            )
          })}
          <p className="ml-auto text-xs font-bold" style={{ color: C.dimmer }}>
            {block.current_week}/{totalWeeks}
          </p>
        </div>
      </div>

      {/* Divider */}
      <div className="mb-4" style={{ height: 1, backgroundColor: C.border }} />

      {/* ── Tab switcher ──────────────────────────────────────────────────── */}
      <div className="flex rounded-xl p-1 mb-4 gap-1" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
        {(['log', '3rm'] as const).map(t => (
          <button key={t}
            onClick={() => { setTab(t); setSaveError(null) }}
            className="flex-1 py-2 rounded-lg text-sm font-bold transition-all"
            style={{
              backgroundColor: tab === t ? C.orange : 'transparent',
              color: tab === t ? C.white : C.dim,
              boxShadow: tab === t ? '0 2px 12px rgba(255,92,62,0.4)' : 'none',
            }}
          >
            {t === 'log' ? 'Log Week' : 'Set 3RM'}
          </button>
        ))}
      </div>

      {/* ── Error banner ──────────────────────────────────────────────────── */}
      {saveError && (
        <div className="rounded-xl px-4 py-3 text-sm font-semibold mb-4 flex gap-2 items-start"
          style={{ backgroundColor: 'rgba(255,92,62,0.12)', color: '#FF8C78', border: '1px solid rgba(255,92,62,0.3)' }}>
          <span>⚠️</span><span>{saveError}</span>
        </div>
      )}

      {/* ── LOG TAB ───────────────────────────────────────────────────────── */}
      {tab === 'log' && (
        <div className="space-y-3">

          {/* Session header */}
          <div className="flex items-center justify-between px-1 mb-1">
            <p className="text-xs font-bold tracking-widest uppercase" style={{ color: C.dim }}>
              Today&apos;s Session
            </p>
            {allDone ? (
              <span className="text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5"
                style={{ backgroundColor: 'rgba(0,200,150,0.15)', color: C.green, border: `1px solid rgba(0,200,150,0.3)` }}>
                <Tick size={12} color={C.green} /> All done
              </span>
            ) : (
              <span className="text-xs font-bold" style={{ color: C.dim }}>
                {loggedCount}/{LIFTS.length} logged
              </span>
            )}
          </div>

          {/* All done banner */}
          {allDone && (
            <div className="rounded-2xl p-4 flex items-center gap-3 mb-2"
              style={{ backgroundColor: 'rgba(0,200,150,0.08)', border: `1px solid rgba(0,200,150,0.2)` }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: C.green }}>
                <Tick size={18} />
              </div>
              <div>
                <p className="font-black text-sm" style={{ color: C.green }}>Session complete</p>
                <p className="text-xs mt-0.5" style={{ color: 'rgba(0,200,150,0.6)' }}>
                  All lifts logged. See you next week 💪
                </p>
              </div>
            </div>
          )}

          {LIFTS.map(lift => {
            const rm      = threeRMs.find(r => r.lift === lift)
            const target  = rm ? calcTarget(rm.weight_kg, block.current_week, blockType) : null
            const logged  = weekLifts.find(l => l.lift === lift)
            const meta    = LIFT_META[lift]
            const displayWeightKg = logged?.weight_kg ?? target
            const pct = rm && displayWeightKg ? Math.round((displayWeightKg / rm.weight_kg) * 100) : null
            const diff = logged && target ? +(logged.weight_kg - target).toFixed(1) : null
            const history = liftHistory[lift]
            const sparkData = history.map(h => h.weight)
            const recentHistory = history.slice(-5)

            return (
              <div key={lift} className="rounded-2xl overflow-hidden"
                style={{
                  backgroundColor: C.card,
                  border: `1px solid ${logged?.is_pr ? meta.hue + '40' : C.border}`,
                  boxShadow: logged?.is_pr ? `0 0 24px ${meta.hue}20` : 'none',
                }}>

                {/* PR flash bar */}
                {logged?.is_pr && (
                  <div className="h-1 w-full"
                    style={{ background: `linear-gradient(90deg, ${meta.hue}, ${C.orange})` }} />
                )}

                <div className="px-4 pt-4 pb-3">
                  {/* Top row: badge + name + status */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm flex-shrink-0"
                        style={{ backgroundColor: logged ? (logged.is_pr ? meta.hue : C.green) : meta.hue + '22', color: logged ? C.white : meta.hue }}>
                        {logged ? <Tick size={16} /> : meta.abbr}
                      </div>
                      <p className="font-black text-base tracking-wide uppercase" style={{ color: C.white }}>
                        {meta.label}
                      </p>
                    </div>

                    {logged?.is_pr ? (
                      <span className="text-xs font-black px-2.5 py-1 rounded-full tracking-wide"
                        style={{ backgroundColor: meta.hue + '22', color: meta.hue }}>
                        🔥 NEW PR
                      </span>
                    ) : logged ? (
                      <span className="text-xs font-bold px-2.5 py-1 rounded-full"
                        style={{ backgroundColor: 'rgba(0,200,150,0.12)', color: C.green }}>
                        ✓ Logged
                      </span>
                    ) : target ? (
                      <span className="text-xs font-bold" style={{ color: C.dimmer }}>
                        Target set
                      </span>
                    ) : (
                      <span className="text-xs font-bold" style={{ color: C.dimmer }}>
                        Set 3RM first
                      </span>
                    )}
                  </div>

                  {/* Big weight display — Wodify-style */}
                  {displayWeightKg ? (
                    <div className="mb-3">
                      {/* Sets × Reps label */}
                      <p style={{ fontSize: 13, color: C.dimmer, fontWeight: 600, marginBottom: 2 }}>
                        3 × {weekCfg.reps} @
                      </p>
                      <div className="flex items-end gap-1 leading-none">
                        <span className="font-black"
                          style={{
                            fontSize: 52,
                            lineHeight: 1,
                            color: logged ? (logged.is_pr ? meta.hue : C.white) : C.orange,
                            letterSpacing: '-2px',
                          }}>
                          {toDisplay(displayWeightKg)}
                        </span>
                        <span className="font-bold mb-2 text-base" style={{ color: C.dim }}>{unitLabel}</span>
                        {diff !== null && diff !== 0 && (
                          <span className="font-bold mb-2 text-sm ml-1"
                            style={{ color: diff > 0 ? C.green : C.orange }}>
                            {diff > 0 ? `+${toDisplay(diff)}` : toDisplay(diff)}
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-semibold" style={{ color: C.dim }}>
                        {logged
                          ? `${logged.reps} reps completed`
                          : `${weekCfg.reps} reps · target`
                        }
                      </p>
                    </div>
                  ) : (
                    <div className="mb-3 py-3">
                      <p className="text-sm font-semibold" style={{ color: C.dimmer }}>
                        Set your 3RM to see this week's target weight
                      </p>
                    </div>
                  )}

                  {/* Intensity bar */}
                  {pct !== null && (
                    <div className="mb-3">
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
                        <div className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${Math.min(pct, 105)}%`,
                            background: logged?.is_pr
                              ? `linear-gradient(90deg, ${meta.hue}, ${C.orange})`
                              : logged
                              ? C.green
                              : `linear-gradient(90deg, ${meta.hue}99, ${meta.hue}44)`,
                          }}
                        />
                      </div>
                      <p className="text-xs mt-1 font-semibold" style={{ color: C.dimmer }}>
                        {pct}% of 3RM{rm ? ` · 3RM: ${toDisplay(rm.weight_kg)} ${unitLabel}` : ''}
                      </p>
                    </div>
                  )}
                </div>

                {/* Input row */}
                <div className="px-4 pb-3 flex gap-2">
                  <input
                    type="number" inputMode="decimal"
                    placeholder={
                      logged
                        ? `${toDisplay(logged.weight_kg)}`
                        : target
                        ? `${toDisplay(target)}`
                        : unitLabel
                    }
                    value={weights[lift]}
                    onChange={e => setWeights(prev => ({ ...prev, [lift]: e.target.value }))}
                    className="flex-1 px-3 rounded-xl outline-none font-bold"
                    style={{
                      height: 48, border: `1px solid ${C.inputBdr}`,
                      backgroundColor: C.inputBg, color: C.white,
                      fontSize: 16, caretColor: C.orange,
                    }}
                  />
                  <button
                    onClick={() => logLift(lift)}
                    disabled={saving === lift || !weights[lift]}
                    className="rounded-xl font-black text-sm transition-all"
                    style={{
                      height: 48, minWidth: 88, paddingLeft: 20, paddingRight: 20,
                      backgroundColor: saving === lift ? C.orange + '60' : logged ? C.cardAlt : C.orange,
                      color: C.white,
                      border: logged && !saving ? `1px solid ${C.borderHi}` : 'none',
                      opacity: !weights[lift] && saving !== lift ? 0.4 : 1,
                      boxShadow: weights[lift] && saving !== lift ? `0 4px 16px ${C.orange}50` : 'none',
                    }}
                  >
                    {saving === lift ? '...' : logged ? 'Update' : 'Log it'}
                  </button>
                </div>

                {/* View history toggle */}
                <div className="px-4 pb-4">
                  <button
                    onClick={() => setShowHistory(prev => ({ ...prev, [lift]: !prev[lift] }))}
                    style={{
                      background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.orange }}>
                      {showHistory[lift] ? 'Hide history' : 'View history'}
                    </span>
                    {sparkData.length >= 2 && (
                      <Sparkline data={sparkData} color={meta.hue} />
                    )}
                  </button>

                  {showHistory[lift] && (
                    <div className="mt-3 space-y-1">
                      {recentHistory.length === 0 ? (
                        <p style={{ fontSize: 12, color: C.dimmer }}>No history yet.</p>
                      ) : (
                        recentHistory.map((entry, idx) => {
                          const dateStr = new Date(entry.date).toLocaleDateString('en-AU', {
                            day: 'numeric', month: 'short',
                          })
                          return (
                            <div key={idx}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '6px 10px', borderRadius: 10,
                                backgroundColor: 'rgba(255,255,255,0.04)',
                              }}>
                              <span style={{ fontSize: 11, color: C.dimmer, minWidth: 52 }}>{dateStr}</span>
                              <span style={{ fontSize: 12, fontWeight: 700, color: C.white }}>
                                {toDisplay(entry.weight)} {unitLabel}
                              </span>
                              {entry.reps !== null && (
                                <span style={{ fontSize: 11, color: C.dimmer }}>× {entry.reps}</span>
                              )}
                            </div>
                          )
                        })
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── 3RM TAB ───────────────────────────────────────────────────────── */}
      {tab === '3rm' && (
        <div className="space-y-3">
          <div className="px-1 mb-1">
            <p className="text-xs font-bold tracking-widest uppercase" style={{ color: C.dim }}>
              Your 3-Rep Maxes
            </p>
            <p className="text-sm mt-1" style={{ color: C.dimmer }}>
              All weekly targets auto-calculate from these.
            </p>
          </div>

          {LIFTS.map(lift => {
            const current = threeRMs.find(r => r.lift === lift)
            const meta    = LIFT_META[lift]

            return (
              <div key={lift} className="rounded-2xl overflow-hidden"
                style={{ backgroundColor: C.card, border: `1px solid ${C.border}` }}>
                <div className="px-4 pt-4 pb-3">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm flex-shrink-0"
                        style={{ backgroundColor: meta.hue + '22', color: meta.hue }}>
                        {meta.abbr}
                      </div>
                      <p className="font-black text-base tracking-wide uppercase" style={{ color: C.white }}>
                        {meta.label}
                      </p>
                    </div>
                    {!current && (
                      <span className="text-xs font-bold px-2.5 py-1 rounded-full"
                        style={{ backgroundColor: C.orange + '18', color: C.orange }}>
                        Not set
                      </span>
                    )}
                  </div>

                  {/* Big 3RM display */}
                  {current ? (
                    <div className="mb-3">
                      <div className="flex items-end gap-1 leading-none">
                        <span className="font-black" style={{ fontSize: 48, lineHeight: 1, color: meta.hue, letterSpacing: '-2px' }}>
                          {toDisplay(current.weight_kg)}
                        </span>
                        <span className="font-bold mb-1.5 text-base" style={{ color: C.dim }}>{unitLabel}</span>
                      </div>
                      <p className="text-sm font-semibold" style={{ color: C.dim }}>Current 3RM</p>
                    </div>
                  ) : (
                    <p className="text-sm font-semibold mb-3" style={{ color: C.dimmer }}>
                      Enter your 3-rep max below
                    </p>
                  )}
                </div>

                <div className="px-4 pb-4 flex gap-2">
                  <input
                    type="number" inputMode="decimal"
                    placeholder={current ? `Update (${toDisplay(current.weight_kg)} ${unitLabel})` : `Enter 3RM in ${unitLabel}`}
                    value={rmInputs[lift]}
                    onChange={e => setRmInputs(prev => ({ ...prev, [lift]: e.target.value }))}
                    className="flex-1 px-3 rounded-xl outline-none font-bold"
                    style={{
                      height: 48, border: `1px solid ${C.inputBdr}`,
                      backgroundColor: C.inputBg, color: C.white,
                      fontSize: 16, caretColor: meta.hue,
                    }}
                  />
                  <button
                    onClick={() => saveRM(lift)}
                    disabled={saving === lift || !rmInputs[lift]}
                    className="rounded-xl font-black text-sm transition-all"
                    style={{
                      height: 48, minWidth: 88, paddingLeft: 20, paddingRight: 20,
                      backgroundColor: saving === lift ? C.orange + '60' : C.orange,
                      color: C.white,
                      opacity: !rmInputs[lift] && saving !== lift ? 0.4 : 1,
                      boxShadow: rmInputs[lift] && saving !== lift ? `0 4px 16px ${C.orange}50` : 'none',
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
