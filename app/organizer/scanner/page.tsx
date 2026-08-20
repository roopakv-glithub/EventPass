import { redirect } from 'next/navigation'
import { OrganizerScanner } from '@/components/organizer-scanner'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export default async function OrganizerScannerPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'organizer') redirect('/unauthorized')
  const { data: event } = await supabase.from('events').select('id').eq('organizer_id', user.id).eq('status', 'published').order('event_date').limit(1).maybeSingle()
  return <main className="qr-page"><div className="qr-page-head"><div><p className="eyebrow">DOOR CONTROL</p><h1>Check-in scanner</h1><p className="subhead">Secure validation with offline-ready sync.</p></div><a className="button button-outline" href="/">Back to workspace</a></div>{event ? <OrganizerScanner eventId={event.id} /> : <div className="empty-state"><h2>No published events</h2><p>Publish an event before opening its scanner.</p></div>}</main>
}
