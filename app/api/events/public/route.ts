import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Missing Supabase URL or Key in environment variables')
  return createClient(url, key)
}

export async function GET() {
  try {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .order('event_date', { ascending: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ events: data ?? [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Server error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = getSupabaseClient()
    const body = await request.json().catch(() => null)
    if (!body?.name || !body?.event_date || !body?.start_time || !body?.capacity) {
      return NextResponse.json(
        { error: 'Event name, date, start time, and capacity are required' },
        { status: 400 },
      )
    }
    if (!Number.isInteger(Number(body.capacity)) || Number(body.capacity) < 1) {
      return NextResponse.json({ error: 'Capacity must be a positive whole number' }, { status: 400 })
    }
    if (body.end_time && body.end_time <= body.start_time) {
      return NextResponse.json({ error: 'End time must be later than start time' }, { status: 400 })
    }

    // Find any existing profile or fallback to creating one if service role key is present
    let organizerId: string | null = null
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id')
      .limit(1)

    if (profiles && profiles.length > 0) {
      organizerId = profiles[0].id
    } else if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const { data: authUser } = await supabase.auth.admin.createUser({
        email: `organizer-${Date.now()}@eventpass.local`,
        password: 'eventpass-system-2026',
        email_confirm: true,
        user_metadata: { full_name: 'Default Organizer', role: 'organizer' },
      })
      if (authUser?.user) {
        organizerId = authUser.user.id
        await supabase.from('profiles').update({ role: 'organizer' }).eq('id', organizerId)
      }
    }

    if (!organizerId) {
      const { data: signUpData } = await supabase.auth.signUp({
        email: `organizer-${Date.now()}@eventpass.local`,
        password: 'eventpass-system-2026',
        options: { data: { full_name: 'Default Organizer', role: 'organizer' } },
      })
      if (signUpData?.user) {
        organizerId = signUpData.user.id
      }
    }

    const payload: any = {
      name: body.name,
      event_date: body.event_date,
      start_time: body.start_time,
      end_time: body.end_time || null,
      capacity: Number(body.capacity),
      description: body.description ?? '',
      location: body.location ?? '',
      image_url: body.image_url ?? null,
      status: 'published',
    }
    if (organizerId) {
      payload.organizer_id = organizerId
    }

    // Try full insert with event_number and event_type
    let insertResult = await supabase
      .from('events')
      .insert({
        ...payload,
        event_number: body.event_number || null,
        event_type: body.event_type || 'General',
      })
      .select()
      .single()

    // Fallback if optional columns don't exist in schema
    if (insertResult.error && insertResult.error.message.includes('column')) {
      const descPrefix = [
        body.event_number ? `[ID: ${body.event_number}]` : '',
        body.event_type ? `[Type: ${body.event_type}]` : '',
      ].filter(Boolean).join(' ')
      
      insertResult = await supabase
        .from('events')
        .insert({
          ...payload,
          description: descPrefix ? `${descPrefix} ${payload.description}`.trim() : payload.description,
        })
        .select()
        .single()
    }

    if (insertResult.error) {
      if (insertResult.error.message.includes('organizer_id')) {
        return NextResponse.json({ 
          error: 'organizer_id is null constraint error. To fix: Run migration 005_make_organizer_id_optional.sql in your database SQL editor.'
        }, { status: 400 })
      }
      if (insertResult.error.message.includes('permission denied') || insertResult.error.code === '42501') {
        return NextResponse.json({ 
          error: 'Database permission denied. To fix: add the server key to .env.local or run migration 004_allow_public_event_insert.sql in your database SQL editor.'
        }, { status: 403 })
      }
      return NextResponse.json({ error: insertResult.error.message }, { status: 400 })
    }
    return NextResponse.json({ event: insertResult.data }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Server error' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = getSupabaseClient()
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'id is required to delete event' }, { status: 400 })
    }

    const { error } = await supabase.from('events').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ success: true, deleted_event_id: id })
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Server error' }, { status: 500 })
  }
}

