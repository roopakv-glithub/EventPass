import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body?.event_id || typeof body.event_id !== 'string') {
    return NextResponse.json({ error: 'event_id is required' }, { status: 400 })
  }

  const { data, error } = await supabase.rpc('register_for_event', { target_event_id: body.event_id })
  if (error) {
    const status = error.code === '23505' ? 409 : error.message.includes('full') ? 409 : error.code === '42501' ? 401 : 400
    return NextResponse.json({ error: error.message }, { status })
  }
  return NextResponse.json({ registration: data }, { status: 201 })
}
