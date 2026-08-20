'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { BarChart3, CalendarDays, CheckCircle2, ChevronDown, Download, LayoutDashboard, LogOut, Plus, ScanLine, Search, Ticket, Users } from 'lucide-react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { AnalyticsDashboard, type LiveAnalyticsDatum } from '@/components/analytics-dashboard'
import { RegisterButton } from '@/components/register-button'

type Role = 'participant' | 'organizer'
type EventRecord = { id: string; name: string; event_date: string; start_time: string; end_time: string | null; capacity: number; description: string; location: string; status: string; organizer_id: string }
type Profile = { id: string; full_name: string; email: string | null; role: Role }

type Props = { userId: string; profile: Profile; dark: boolean; setDark: (value: boolean) => void }

function EventCard({ event, participant }: { event: EventRecord; participant: boolean }) {
  return <article className="event-card"><a className="event-cover blue" href={participant ? `/participant/events/${event.id}` : `/organizer/events/${event.id}`}><span>{event.status}</span><div className="cover-title">{event.name}</div></a><div className="event-card-body"><h3><a href={participant ? `/participant/events/${event.id}` : `/organizer/events/${event.id}`}>{event.name}</a></h3><p>{event.description || 'Event details will be available soon.'}</p><div className="event-meta"><span><CalendarDays size={15} />{event.event_date}</span><span>{event.start_time}</span><span>{event.location}</span></div><div className="event-footer"><span className="attendee-count"><Users size={15} />Capacity {event.capacity}</span>{participant ? <RegisterButton eventId={event.id} disabled={event.status !== 'published'} /> : <a className="button button-outline" href={`/organizer/events/${event.id}`}>Manage</a>}</div></div></article>
}

function CreateEventModal({ close, refresh }: { close: () => void; refresh: () => Promise<void> }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError('')
    const values = Object.fromEntries(new FormData(event.currentTarget))
    const response = await fetch('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...values, capacity: Number(values.capacity) }) })
    if (!response.ok) { setError((await response.json()).error ?? 'Unable to create event'); setLoading(false); return }
    await refresh(); close()
  }
  return <div className="modal-backdrop" role="dialog" aria-modal="true"><form className="create-event-form modal-form" onSubmit={submit}><div className="panel-heading"><div><p className="eyebrow">NEW EVENT</p><h2>Create event</h2></div><button type="button" className="icon-button" aria-label="Close" onClick={close}>×</button></div><label>Event name<input name="name" required minLength={2} /></label><div className="create-event-row"><label>Date<input name="event_date" type="date" required /></label><label>Start time<input name="start_time" type="time" required /></label><label>End time<input name="end_time" type="time" /></label></div><label>Capacity<input name="capacity" type="number" min="1" required /></label><label>Location<input name="location" /></label><label>Description<textarea name="description" rows={4} /></label>{error && <p className="form-error">{error}</p>}<div className="scanner-controls"><button type="button" className="button button-outline" onClick={close}>Cancel</button><button className="button button-dark" disabled={loading}>{loading ? 'Creating...' : 'Create event'}</button></div></form></div>
}

export function ConnectedWorkspace({ userId, profile, dark, setDark }: Props) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), [])
  const [page, setPage] = useState(profile.role === 'organizer' ? 'overview' : 'events')
  const [events, setEvents] = useState<EventRecord[]>([])
  const [registrations, setRegistrations] = useState<any[]>([])
  const [selectedEvent, setSelectedEvent] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [liveData, setLiveData] = useState<Record<string, LiveAnalyticsDatum>>({})

  async function refresh() {
    setLoading(true)
    const eventQuery = profile.role === 'organizer' ? supabase.from('events').select('*').eq('organizer_id', userId).order('event_date') : supabase.from('events').select('*').eq('status', 'published').order('event_date')
    const { data: eventData } = await eventQuery
    const nextEvents = (eventData ?? []) as EventRecord[]
    setEvents(nextEvents); setSelectedEvent((current) => current || nextEvents[0]?.id || '')
    if (profile.role === 'organizer') {
      const stats = await Promise.all(nextEvents.map(async (item) => {
        const [{ data: statsData }, { data: checkIns }] = await Promise.all([
          supabase.rpc('event_stats', { target_event_id: item.id }),
          supabase.from('check_ins').select('checked_in_at').eq('event_id', item.id).order('checked_in_at'),
        ])
        const times = (checkIns ?? []).map((entry: any) => new Date(entry.checked_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
        const counts = times.reduce<Record<string, number>>((result, time) => { result[time] = (result[time] ?? 0) + 1; return result }, {})
        return [item.id, { labels: Object.keys(counts), checkIns: Object.values(counts), registered: Number(statsData?.registered ?? 0), checkedIn: Number(statsData?.checked_in ?? 0) }] as const
      }))
      setLiveData(Object.fromEntries(stats))
    }
    if (profile.role === 'organizer' && nextEvents[0]) {
      const { data } = await supabase.from('registrations').select('id,status,registered_at,profiles(full_name,email),check_ins(checked_in_at)').eq('event_id', nextEvents[0].id).order('registered_at', { ascending: false })
      setRegistrations(data ?? [])
    }
    setLoading(false)
  }

  useEffect(() => { refresh() }, [])
  useEffect(() => {
    const channel = supabase.channel(`eventpass-${userId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, refresh).on('postgres_changes', { event: '*', schema: 'public', table: 'registrations' }, refresh).on('postgres_changes', { event: '*', schema: 'public', table: 'check_ins' }, refresh).subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase, userId])

  async function logout() { await supabase.auth.signOut(); window.location.href = '/' }
  const event = events.find((item) => item.id === selectedEvent) ?? events[0]
  const visibleRegistrations = registrations.filter((item) => `${item.profiles?.full_name} ${item.profiles?.email}`.toLowerCase().includes(search.toLowerCase()))
  const checkedIn = registrations.filter((item) => item.check_ins?.length).length
  const nav = profile.role === 'organizer' ? [['Overview', 'overview', LayoutDashboard], ['Events', 'events', CalendarDays], ['Participants', 'participants', Users], ['Scanner', 'scanner', ScanLine], ['Analytics', 'analytics', BarChart3]] : [['Upcoming events', 'events', CalendarDays], ['My QR', 'my-qr', Ticket]]

  return <div className="app-frame"><aside className="sidebar"><div className="brand"><div className="brand-mark">✦</div><span>event<span className="brand-accent">pass</span></span></div><div className="role-switch"><span>Signed in as</span><strong>{profile.role === 'organizer' ? 'Organizer' : 'Participant'}</strong></div><nav className="nav-list">{nav.map(([label, key, Icon]: any) => <button className={page === key ? 'nav-item active' : 'nav-item'} key={key} onClick={() => key === 'my-qr' ? window.location.assign('/participant/my-qr') : key === 'scanner' ? window.location.assign('/organizer/scanner') : setPage(key)}><Icon size={18} />{label}</button>)}</nav><div className="sidebar-bottom"><button className="nav-item" onClick={logout}><LogOut size={18} />Sign out</button><div className="profile"><div className="avatar">{profile.full_name.slice(0, 2).toUpperCase()}</div><div><strong>{profile.full_name}</strong><span>{profile.email}</span></div></div></div></aside><main className="main-area"><header className="topbar"><div className="breadcrumbs"><span>EventPass</span><span>/</span><strong>{page[0].toUpperCase() + page.slice(1)}</strong></div><div className="top-actions"><span className="live-indicator"><span />Live data</span><button className="icon-button" onClick={() => setDark(!dark)} aria-label="Toggle theme">{dark ? '☼' : '◐'}</button><div className="top-avatar">{profile.full_name.slice(0, 2).toUpperCase()}</div></div></header><div className="page-content">{profile.role === 'organizer' && page === 'analytics' ? <AnalyticsDashboard events={events.map((item) => ({ id: item.id, title: item.name, date: item.event_date, attendees: liveData[item.id]?.registered ?? 0, capacity: item.capacity }))} liveData={liveData} /> : <><section className="page-heading"><div><p className="eyebrow">{profile.role === 'organizer' ? 'ORGANIZER WORKSPACE' : 'DISCOVER'}</p><h1>{profile.role === 'organizer' ? page === 'events' ? 'Your events' : page === 'participants' ? 'Attendees' : 'Good morning, ' + profile.full_name.split(' ')[0] : 'Find your next room.'}</h1><p className="subhead">{profile.role === 'organizer' ? 'Connected to Supabase realtime.' : 'Register for events and receive your unique QR pass.'}</p></div>{profile.role === 'organizer' && <button className="button button-dark" onClick={() => setShowCreate(true)}><Plus size={16} />Create event</button>}</section>{profile.role === 'organizer' && page === 'overview' && <div className="stats-grid"><StatCard label="Total events" value={String(events.length)} icon={CalendarDays} /><StatCard label="Registrations" value={String(registrations.length)} icon={Users} /><StatCard label="Checked in" value={String(checkedIn)} icon={CheckCircle2} /><StatCard label="Available capacity" value={String(Math.max((event?.capacity ?? 0) - registrations.length, 0))} icon={Ticket} /></div>}{profile.role === 'organizer' && page === 'participants' && <section className="panel table-panel"><div className="table-tools"><div className="search-box"><Search size={16} /><input value={search} onChange={(item) => setSearch(item.target.value)} placeholder="Search attendees" /></div>{event && <a className="button button-outline" href={`/api/events/${event.id}/export`}><Download size={15} />Export CSV</a>}</div><div className="table-wrap"><table><thead><tr><th>Participant</th><th>Registration</th><th>Check-in</th></tr></thead><tbody>{visibleRegistrations.map((item) => <tr key={item.id}><td>{item.profiles?.full_name}<span>{item.profiles?.email}</span></td><td>{item.status}</td><td>{item.check_ins?.length ? <span className="status success">Checked in</span> : <span className="status neutral">Not checked in</span>}</td></tr>)}</tbody></table>{!visibleRegistrations.length && <div className="empty-state">No attendees found.</div>}</div></section>}{(profile.role === 'participant' || page === 'events') && <div className="event-grid three">{events.map((item) => <EventCard key={item.id} event={item} participant={profile.role === 'participant'} />)}</div>}{loading && <p className="subhead">Loading live data...</p>}</>}</div></main>{showCreate && <CreateEventModal close={() => setShowCreate(false)} refresh={refresh} />}</div>
}

function StatCard({ label, value, icon: Icon }: { label: string; value: string; icon: any }) { return <div className="stat-card"><div className="stat-top"><span>{label}</span><div className="stat-icon"><Icon size={17} /></div></div><strong className="stat-value">{value}</strong><div className="stat-change"><span>Live from Supabase</span></div></div> }
