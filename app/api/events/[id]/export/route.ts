import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

function csvCell(value: unknown) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  const { data: event } = await supabase.from('events').select('id,organizer_id').eq('id', id).single()
  if (!event || event.organizer_id !== user.id) return NextResponse.json({ error: 'Organizer access required' }, { status: 403 })
  const { data, error } = await supabase.from('registrations').select('id,status,registered_at,profiles(full_name,email),check_ins(checked_in_at)').eq('event_id', id).order('registered_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  const rows = [['Registration ID', 'Name', 'Email', 'Registration status', 'Check-in status', 'Check-in timestamp'], ...(data ?? []).map((item: any) => [item.id, item.profiles?.full_name, item.profiles?.email, item.status, item.check_ins?.length ? 'Checked in' : 'Not checked in', item.check_ins?.[0]?.checked_in_at ?? ''])]
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n')
  return new NextResponse(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="event-${id}-attendees.csv"` } })
}
