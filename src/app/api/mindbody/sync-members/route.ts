import { NextResponse } from 'next/server'
import { syncMindBodyMembers } from '@/lib/mindbody/sync'

export async function POST(request: Request) {
  // Verify secret header for cron/webhook security
  const authHeader = request.headers.get('authorization')
  const secret = process.env.SYNC_SECRET

  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await syncMindBodyMembers()
    return NextResponse.json({ success: true, ...result })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
