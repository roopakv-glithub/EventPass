import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { RegisterButton } from '@/components/register-button'

export default async function EventDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')
  const { data: event } = await supabase.from('events').select('*').eq('id', id).single()
  if (!event) return <main className="auth-page"><div className="auth-card"><h1>Event not found</h1><p className="subhead">This event may have been removed or is not published.</p></div></main>
  const { count } = await supabase.from('registrations').select('id', { count: 'exact', head: true }).eq('event_id', id).eq('status', 'registered')
  const { data: registration } = await supabase.from('registrations').select('id,status').eq('event_id', id).eq('participant_id', user.id).maybeSingle()
  const available = Math.max(event.capacity - (count ?? 0), 0)
  return <main className="event-detail-page"><a className="text-button" href="/">← Back to events</a><section className="event-detail-hero"><p className="eyebrow">{event.status}</p><h1>{event.name}</h1><p className="subhead">{event.description}</p><div className="event-detail-meta"><span>{event.event_date}</span><span>{event.start_time}{event.end_time ? ` – ${event.end_time}` : ''}</span><span>{event.location}</span></div></section><div className="event-detail-grid"><div><h2>About this event</h2><p>{event.description || 'Event details will be published soon.'}</p></div><aside className="event-detail-aside"><span>Available seats</span><strong>{available}</strong><small>of {event.capacity}</small>{registration ? <button className="button button-outline" disabled>Already registered</button> : <RegisterButton eventId={event.id} disabled={available === 0} />}</aside></div></main>
}
