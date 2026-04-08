'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { WEEK_CONFIG } from '@/lib/rig/weights'
import Link from 'next/link'

export default function RigCoachSetupPage() {
  const supabase = createClient()
  const router = useRouter()
  const [blocks, setBlocks] = useState<any[]>([])
  const [block, setBlock] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newBlockName, setNewBlockName] = useState('')
  const [showNewBlock, setShowNewBlock] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    const { data: all } = await supabase
      .from('rig_blocks')
      .select('*')
      .order('created_at', { ascending: false })

    setBlocks(all || [])
    setBlock((all || []).find((b: any) => b.active) ?? null)
    setLoading(false)
  }

  async function createBlock() {
    if (!newBlockName.trim()) return
    setSaving(true)

    // Deactivate all blocks first
    await supabase.from('rig_blocks').update({ active: false }).neq('id', '00000000-0000-0000-0000-000000000000')

    const { error } = await supabase.from('rig_blocks').insert({
      name: newBlockName.trim(),
      current_week: 1,
      active: true,
      started_at: new Date().toISOString(),
    })

    if (!error) {
      setNewBlockName('')
      setShowNewBlock(false)
      await loadData()
    }

    setSaving(false)
  }

  async function advanceWeek() {
    if (!block) return
    const nextWeek = Math.min(block.current_week + 1, 6)
    setSaving(true)

    await supabase.from('rig_blocks').update({ current_week: nextWeek }).eq('id', block.id)
    await loadData()
    setSaving(false)
  }

  async function endBlock() {
    if (!block) return
    setSaving(true)
    await supabase.from('rig_blocks').update({ active: false, ended_at: new Date().toISOString() }).eq('id', block.id)
    await loadData()
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: '#FF5722', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  return (
    <div className="px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/rig/coach" style={{ color: '#888888' }}>‹ Back</Link>
        <h1 className="text-xl font-bold" style={{ color: '#1A1A1A' }}>Block Setup</h1>
      </div>

      {/* Active Block */}
      {block ? (
        <div className="bg-white rounded-2xl p-5 border" style={{ borderColor: '#FF5722', borderWidth: '1.5px' }}>
          <div className="flex items-start justify-between mb-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-widest px-2 py-0.5 rounded-full mb-2 inline-block" style={{ backgroundColor: '#FFF0EB', color: '#FF5722' }}>
                Active
              </span>
              <h2 className="text-lg font-bold mt-1" style={{ color: '#1A1A1A' }}>{block.name}</h2>
              <p className="text-sm" style={{ color: '#888888' }}>
                Week {block.current_week} of 6 · {WEEK_CONFIG.find(w => w.week === block.current_week)?.label}
              </p>
            </div>
          </div>

          {/* Week progress */}
          <div className="flex gap-1.5 mb-5">
            {WEEK_CONFIG.map(w => (
              <div
                key={w.week}
                className="flex-1 h-2 rounded-full"
                style={{
                  backgroundColor: w.week <= block.current_week ? '#FF5722' : '#F3F2F0',
                }}
              />
            ))}
          </div>

          <div className="space-y-2">
            <button
              onClick={advanceWeek}
              disabled={saving || block.current_week >= 6}
              className="w-full py-3 rounded-xl font-semibold text-white text-sm"
              style={{ backgroundColor: saving || block.current_week >= 6 ? '#FFB8A0' : '#FF5722' }}
            >
              {block.current_week >= 6 ? 'Final Week Reached' : `Advance to Week ${block.current_week + 1}`}
            </button>

            <button
              onClick={endBlock}
              disabled={saving}
              className="w-full py-3 rounded-xl font-semibold text-sm border"
              style={{ borderColor: '#E8E6E3', color: '#888888', backgroundColor: 'white' }}
            >
              End Block
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl p-5 border text-center" style={{ borderColor: '#E8E6E3' }}>
          <p className="text-4xl mb-3">📋</p>
          <p className="font-semibold" style={{ color: '#1A1A1A' }}>No Active Block</p>
          <p className="text-sm mt-1" style={{ color: '#888888' }}>Create a new training block to get started.</p>
        </div>
      )}

      {/* New block form */}
      {showNewBlock ? (
        <div className="bg-white rounded-2xl p-5 border" style={{ borderColor: '#E8E6E3' }}>
          <h2 className="font-semibold mb-3" style={{ color: '#1A1A1A' }}>New Block</h2>
          <input
            type="text"
            placeholder="e.g. Block 4 — Autumn 2026"
            value={newBlockName}
            onChange={e => setNewBlockName(e.target.value)}
            className="w-full px-4 rounded-xl border outline-none mb-3"
            style={{ height: '48px', borderColor: '#E8E6E3', backgroundColor: '#F8F7F5', color: '#1A1A1A', fontSize: '16px' }}
          />
          <div className="flex gap-2">
            <button
              onClick={() => setShowNewBlock(false)}
              className="flex-1 py-2.5 rounded-xl border text-sm font-semibold"
              style={{ borderColor: '#E8E6E3', color: '#888888' }}
            >
              Cancel
            </button>
            <button
              onClick={createBlock}
              disabled={saving || !newBlockName.trim()}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white"
              style={{ backgroundColor: saving ? '#FFB8A0' : '#FF5722' }}
            >
              {saving ? 'Creating...' : 'Create Block'}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowNewBlock(true)}
          className="w-full py-3 rounded-xl font-semibold text-sm border border-dashed"
          style={{ borderColor: '#FF5722', color: '#FF5722', backgroundColor: '#FFF0EB' }}
        >
          + New Training Block
        </button>
      )}

      {/* Block history */}
      {blocks.filter(b => !b.active).length > 0 && (
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: '#888888' }}>Past Blocks</h2>
          <div className="space-y-2">
            {blocks.filter(b => !b.active).map(b => (
              <div key={b.id} className="bg-white rounded-xl px-4 py-3 border flex items-center justify-between" style={{ borderColor: '#E8E6E3' }}>
                <div>
                  <p className="font-semibold" style={{ color: '#1A1A1A' }}>{b.name}</p>
                  <p className="text-xs" style={{ color: '#888888' }}>
                    {b.started_at ? new Date(b.started_at).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' }) : ''}
                    {b.ended_at ? ` → ${new Date(b.ended_at).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })}` : ''}
                  </p>
                </div>
                <span className="text-xs" style={{ color: '#CCCCCC' }}>Ended</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
