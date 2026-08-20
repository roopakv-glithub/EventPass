import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'organizer') return NextResponse.json({ error: 'Organizer access required' }, { status: 403 })
  const body = await request.json().catch(() => null)
  if (!body?.name || !body?.event_date || !body?.capacity) return NextResponse.json({ error: 'Event name, date, and capacity are required' }, { status: 400 })
  if (!Number.isInteger(body.capacity) || body.capacity < 1) return NextResponse.json({ error: 'Capacity must be a positive whole number' }, { status: 400 })
  const { data, error } = await supabase.from('events').insert({ organizer_id: user.id, name: body.name, event_date: body.event_date, start_time: body.start_time, end_time: body.end_time || null, capacity: body.capacity, description: body.description ?? '', location: body.location ?? '', image_url: body.image_url ?? null, status: 'published' }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ event: data }, { status: 201 })
}
