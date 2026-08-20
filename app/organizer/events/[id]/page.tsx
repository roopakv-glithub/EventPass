import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export default async function OrganizerEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')
  const { data: event } = await supabase.from('events').select('*').eq('id', id).eq('organizer_id', user.id).single()
  if (!event) redirect('/unauthorized')
  const { data: stats } = await supabase.rpc('event_stats', { target_event_id: id })
  const registered = Number(stats?.registered ?? 0)
  const checkedIn = Number(stats?.checked_in ?? 0)
  return <main className="event-detail-page"><a className="text-button" href="/">← Back to dashboard</a><section className="event-detail-hero"><p className="eyebrow">{event.status}</p><h1>{event.name}</h1><p className="subhead">{event.description}</p><div className="event-detail-meta"><span>{event.event_date}</span><span>{event.start_time}{event.end_time ? ` – ${event.end_time}` : ''}</span><span>{event.location}</span></div></section><div className="stats-grid"><div className="stat-card"><span>Registered</span><strong className="stat-value">{registered}</strong></div><div className="stat-card"><span>Checked in</span><strong className="stat-value">{checkedIn}</strong></div><div className="stat-card"><span>Remaining</span><strong className="stat-value">{Math.max(event.capacity - registered, 0)}</strong></div><div className="stat-card"><span>Check-in %</span><strong className="stat-value">{registered ? Math.round((checkedIn / registered) * 100) : 0}%</strong></div></div><div className="scanner-controls"><a className="button button-dark" href="/organizer/scanner">Open scanner</a><a className="button button-outline" href={`/api/events/${id}/export`}>Export attendees</a></div></main>
}
