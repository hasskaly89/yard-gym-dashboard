'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BLOCK_CONFIGS, PHASE_COLORS, type BlockType } from '@/lib/rig/weights'

interface Props {
  blocks: any[]
  lifts: any[]
}

const BLOCK_TYPE_OPTIONS: { type: BlockType; emoji: string; desc: string }[] = [
  { type: 'signature',  emoji: '🏋️', desc: '6 weeks · 3 lifts · 3RM' },
  { type: 'doublegain', emoji: '💪', desc: '8 weeks · 2 lifts · 3RM' },
  { type: 'sprint',     emoji: '⚡', desc: '4 weeks · 1 lift · 1RM' },
]

export default function BlockSetupClient({ blocks, lifts }: Props) {
  const [creating, setCreating] = useState(false)
  const [blockType, setBlockType] = useState<BlockType>('signature')
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [selectedLifts, setSelectedLifts] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const supabase = createClient()
  const cfg = BLOCK_CONFIGS[blockType]

  // Auto-calculate end date
  const endDate = startDate
    ? new Date(new Date(startDate).getTime() + cfg.durationWeeks * 7 * 24 * 60 * 60 * 1000)
        .toISOString().split('T')[0]
    : ''

  function toggleLift(liftId: string) {
    setSelectedLifts(prev => {
      if (prev.includes(liftId)) return prev.filter(id => id !== liftId)
      if (prev.length >= cfg.maxLifts) return [...prev.slice(1), liftId]
      return [...prev, liftId]
    })
  }

  async function createBlock() {
    if (!name || !startDate || selectedLifts.length === 0) {
      setMessage('Please fill in all fields and select lifts.')
      return
    }
    setLoading(true)
    setMessage('')

    try {
      // Deactivate existing blocks
      await supabase.from('rig_blocks').update({ is_active: false }).eq('is_active', true)

      // Create block
      const { data: block, error: blockErr } = await supabase
        .from('rig_blocks')
        .insert({
          name,
          start_date: startDate,
          end_date: endDate,
          is_active: true,
          block_type: blockType,
          test_rm: cfg.testRM,
          duration_weeks: cfg.durationWeeks,
        })
        .select()
        .single()

      if (blockErr) throw blockErr

      // Insert weeks
      const weekRows = cfg.weeks.map(w => ({
        block_id: block.id,
        week_number: w.week,
        rep_scheme: w.reps,
        percentage: w.pct,
        label: w.label,
        phase: w.phase,
        is_test_day: w.isTestDay ?? false,
      }))
      await supabase.from('rig_block_weeks').insert(weekRows)

      // Insert block lifts
      const liftRows = selectedLifts.map((liftId, idx) => ({
        block_id: block.id,
        lift_id: liftId,
        sort_order: idx,
      }))
      await supabase.from('rig_block_lifts').insert(liftRows)

      setMessage('✅ Block created and activated!')
      setCreating(false)
      setName('')
      setStartDate('')
      setSelectedLifts([])
      setTimeout(() => window.location.reload(), 1000)
    } catch (e: any) {
      setMessage('Error: ' + e.message)
    }
    setLoading(false)
  }

  async function deactivateBlock(id: string) {
    await supabase.from('rig_blocks').update({ is_active: false }).eq('id', id)
    window.location.reload()
  }

  const activeBlock = blocks.find(b => b.is_active)

  return (
    <div className="px-4 py-6 max-w-lg mx-auto" style={{ fontFamily: 'DM Sans, sans-serif' }}>
      <h1 className="text-xl font-bold mb-1" style={{ color: '#1A1A1A' }}>Block Setup</h1>
      <p className="text-sm mb-6" style={{ color: '#888' }}>Manage training blocks for your members</p>

      {/* Active Block */}
      {activeBlock && (
        <div className="bg-white rounded-2xl p-4 mb-6 border-2" style={{ borderColor: '#22C55E' }}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold tracking-widest" style={{ color: '#22C55E' }}>ACTIVE BLOCK</span>
            <span className="text-xs px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: '#22C55E' }}>Live</span>
          </div>
          <div className="font-bold text-lg" style={{ color: '#1A1A1A' }}>{activeBlock.name}</div>
          <div className="text-sm mt-0.5" style={{ color: '#888' }}>
            {activeBlock.block_type?.toUpperCase()} · {activeBlock.duration_weeks || 6} weeks · {activeBlock.test_rm || '3RM'}
          </div>
          <div className="text-sm mt-0.5" style={{ color: '#888' }}>
            {activeBlock.start_date} → {activeBlock.end_date}
          </div>
          {/* Week chips */}
          <div className="flex gap-1.5 flex-wrap mt-3">
            {BLOCK_CONFIGS[activeBlock.block_type as BlockType]?.weeks.map(w => (
              <span key={w.week} className="text-xs px-2 py-1 rounded-lg font-medium" style={{ backgroundColor: PHASE_COLORS[w.phase] + '20', color: PHASE_COLORS[w.phase] }}>
                W{w.week} · {w.phase}{w.isTestDay ? ' 🎯' : ''}
              </span>
            ))}
          </div>
          <button
            onClick={() => deactivateBlock(activeBlock.id)}
            className="mt-3 text-xs font-medium"
            style={{ color: '#EF4444' }}
          >
            Deactivate block
          </button>
        </div>
      )}

      {/* Create New Block */}
      {!creating ? (
        <button
          onClick={() => setCreating(true)}
          className="w-full rounded-2xl font-semibold flex items-center justify-center gap-2"
          style={{ height: 52, backgroundColor: '#FF5722', color: 'white', fontSize: 16, border: 'none', cursor: 'pointer' }}
        >
          + Create New Block
        </button>
      ) : (
        <div className="bg-white rounded-2xl p-5" style={{ border: '1.5px solid #E8E6E3' }}>
          <h2 className="font-bold mb-4" style={{ color: '#1A1A1A' }}>New Block</h2>

          {/* Block Type Selector */}
          <label className="block text-xs font-bold tracking-widest mb-2" style={{ color: '#888', textTransform: 'uppercase' }}>Block Type</label>
          <div className="grid grid-cols-3 gap-2 mb-4">
            {BLOCK_TYPE_OPTIONS.map(({ type, emoji, desc }) => (
              <button
                key={type}
                onClick={() => { setBlockType(type); setSelectedLifts([]) }}
                className="rounded-xl p-3 text-left transition-all"
                style={{
                  border: `2px solid ${blockType === type ? '#FF5722' : '#E8E6E3'}`,
                  backgroundColor: blockType === type ? '#FFF3F0' : '#F8F7F5',
                  cursor: 'pointer',
                }}
              >
                <div className="text-xl mb-1">{emoji}</div>
                <div className="text-xs font-bold capitalize" style={{ color: blockType === type ? '#FF5722' : '#1A1A1A' }}>{type}</div>
                <div className="text-xs mt-0.5" style={{ color: '#888' }}>{desc}</div>
              </button>
            ))}
          </div>

          {/* Week Preview */}
          <div className="rounded-xl p-3 mb-4" style={{ backgroundColor: '#F8F7F5' }}>
            <div className="text-xs font-bold tracking-widest mb-2" style={{ color: '#888', textTransform: 'uppercase' }}>Week Structure</div>
            <div className="flex gap-1 flex-wrap">
              {cfg.weeks.map(w => (
                <span key={w.week} className="text-xs px-2 py-1 rounded-lg font-medium" style={{ backgroundColor: PHASE_COLORS[w.phase] + '20', color: PHASE_COLORS[w.phase] }}>
                  W{w.week}{w.isTestDay ? ' 🎯' : ''}
                </span>
              ))}
            </div>
          </div>

          {/* Block Name */}
          <label className="block text-xs font-bold tracking-widest mb-2" style={{ color: '#888', textTransform: 'uppercase' }}>Block Name</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Block 1 · 2026"
            style={{ width: '100%', height: 48, borderRadius: 12, border: '1.5px solid #E8E6E3', padding: '0 14px', fontSize: 16, marginBottom: 16, boxSizing: 'border-box', backgroundColor: '#F8F7F5', color: '#1A1A1A', outline: 'none' }}
          />

          {/* Start Date */}
          <label className="block text-xs font-bold tracking-widest mb-2" style={{ color: '#888', textTransform: 'uppercase' }}>Start Date</label>
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            style={{ width: '100%', height: 48, borderRadius: 12, border: '1.5px solid #E8E6E3', padding: '0 14px', fontSize: 16, marginBottom: 4, boxSizing: 'border-box', backgroundColor: '#F8F7F5', color: '#1A1A1A', outline: 'none' }}
          />
          {endDate && <p className="text-xs mb-4" style={{ color: '#888' }}>Ends: {endDate} ({cfg.durationWeeks} weeks)</p>}

          {/* Lift Selection */}
          <label className="block text-xs font-bold tracking-widest mb-2" style={{ color: '#888', textTransform: 'uppercase' }}>
            Select {cfg.maxLifts === 1 ? '1 Lift' : cfg.maxLifts === 2 ? '2 Lifts' : 'Up to 3 Lifts'}
          </label>
          <div className="flex flex-col gap-2 mb-4">
            {lifts.map((lift: any) => {
              const selected = selectedLifts.includes(lift.id)
              return (
                <button
                  key={lift.id}
                  onClick={() => toggleLift(lift.id)}
                  className="flex items-center gap-3 rounded-xl p-3 text-left"
                  style={{
                    border: `2px solid ${selected ? '#FF5722' : '#E8E6E3'}`,
                    backgroundColor: selected ? '#FFF3F0' : '#F8F7F5',
                    cursor: 'pointer',
                  }}
                >
                  <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: selected ? '#FF5722' : '#E8E6E3' }}>
                    {selected && <span style={{ color: 'white', fontSize: 12 }}>✓</span>}
                  </div>
                  <span className="font-medium" style={{ color: '#1A1A1A' }}>{lift.name}</span>
                </button>
              )
            })}
          </div>

          {message && <p className="text-sm mb-3" style={{ color: message.startsWith('✅') ? '#22C55E' : '#EF4444' }}>{message}</p>}

          <div className="flex gap-2">
            <button
              onClick={() => setCreating(false)}
              style={{ flex: 1, height: 48, borderRadius: 12, border: '1.5px solid #E8E6E3', backgroundColor: 'transparent', cursor: 'pointer', fontWeight: 600, color: '#888' }}
            >
              Cancel
            </button>
            <button
              onClick={createBlock}
              disabled={loading}
              style={{ flex: 2, height: 48, borderRadius: 12, border: 'none', backgroundColor: loading ? '#FFB09A' : '#FF5722', color: 'white', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 15 }}
            >
              {loading ? 'Creating...' : 'Create & Activate'}
            </button>
          </div>
        </div>
      )}

      {/* Past Blocks */}
      {blocks.filter(b => !b.is_active).length > 0 && (
        <div className="mt-6">
          <div className="text-xs font-bold tracking-widest mb-3" style={{ color: '#888', textTransform: 'uppercase' }}>Past Blocks</div>
          {blocks.filter(b => !b.is_active).map(b => (
            <div key={b.id} className="bg-white rounded-xl p-3 mb-2" style={{ border: '1px solid #E8E6E3' }}>
              <div className="font-semibold text-sm" style={{ color: '#1A1A1A' }}>{b.name}</div>
              <div className="text-xs mt-0.5" style={{ color: '#888' }}>{b.start_date} → {b.end_date}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
