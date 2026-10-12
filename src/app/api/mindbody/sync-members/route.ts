import { NextResponse } from 'next/server'
import { syncMindBodyMembers } from '@/lib/mindbody/sync'
import { bearerAuthorized } from '@/lib/auth/machine-auth'

export async function POST(request: Request) {
  if (!bearerAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await syncMindBodyMembers()
    return NextResponse.json({ success: true, ...result })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
