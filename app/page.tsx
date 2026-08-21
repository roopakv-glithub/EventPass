'use client'

import { FormEvent, useEffect, useState } from 'react'
import {
  ArrowRight, BarChart3, Bell, CalendarDays, Check, CheckCircle2, ChevronDown, Clock3,
  Download, ExternalLink, Filter, LayoutDashboard, LogIn, LogOut, Menu, Moon, MoreHorizontal,
  Plus, QrCode, ScanLine, Search, Settings2, ShieldCheck, Sun, Ticket, User, Users,
  X, Zap,
} from 'lucide-react'
import { AnalyticsDashboard } from '@/components/analytics-dashboard'
import { QRCodeSVG } from 'qrcode.react'
import { OrganizerScanner } from '@/components/organizer-scanner'
import { RotatingQRCode } from '@/components/rotating-qr'

function Status({ children }: { children: string }) {
  return <span className={`status ${children === 'Checked in' ? 'success' : children === 'Invalid' ? 'danger' : 'neutral'}`}><span className="status-dot" />{children}</span>
}

function ThemeToggle({ dark, setDark }: { dark: boolean; setDark: (v: boolean) => void }) {
  return <button aria-label="Toggle theme" className="icon-button" onClick={() => setDark(!dark)}>{dark ? <Sun size={17} /> : <Moon size={17} />}</button>
}

function AppShell({ role, setRole, dark, setDark, page, setPage, user, openLoginModal, logout, sidebarOpen, setSidebarOpen, children }: any) {
  const nav = role === 'organizer' ? [
    ['Overview', 'overview', LayoutDashboard], ['Events', 'events', CalendarDays], ['Participants', 'participants', Users], ['Scanner', 'scanner', ScanLine], ['Analytics', 'analytics', BarChart3],
  ] : [['Overview', 'home', LayoutDashboard], ['My events', 'my-events', Ticket], ['Explore events', 'explore', CalendarDays]]

  const userName = user?.name || user?.full_name || user?.email || (role === 'organizer' ? 'Organizer' : 'Participant Guest')
  const userInitials = userName ? userName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() : 'US'

  return <div className="app-frame">
    <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
      <div className="brand" style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
        <div className="brand-mark"><Zap size={17} /></div>
        <span>event<span className="brand-accent">pass</span></span>
        <button 
          className="mobile-close icon-button" 
          onClick={() => setSidebarOpen(false)} 
          style={{ marginLeft: 'auto', display: 'none', fontSize: '20px', border: 'none', background: 'none' }}
        >
          Organizer
        </button>
      </div>
      <div className="role-switch">
        <span>Workspace Mode</span>
        <button onClick={() => { setRole(role === 'organizer' ? 'participant' : 'organizer'); setSidebarOpen(false); }}>
          {role === 'organizer' ? 'Organizer' : 'Participant'}<ChevronDown size={14} />
        </button>
      </div>
      <nav className="nav-list">{nav.map(([label, key, Icon]: any) => <button key={key} className={page === key ? 'nav-item active' : 'nav-item'} onClick={() => { setPage(key); setSidebarOpen(false); }}><Icon size={18} />{label}</button>)}</nav>
      <div className="sidebar-bottom">
        {user ? (
          <button className="nav-item" onClick={() => { logout(); setSidebarOpen(false); }} style={{ color: '#ef4444' }}>
            <LogOut size={18} /> Sign out
          </button>
        ) : (
          <button className="nav-item" onClick={() => { openLoginModal(role); setSidebarOpen(false); }}>
            <LogIn size={18} /> Sign in
          </button>
        )}
        <div className="profile">
          <div className="avatar">{userInitials}</div>
          <div>
            <strong>{userName}</strong>
            <span style={{ fontSize: '11px', opacity: 0.8 }}>
              {user?.regno ? `Reg: ${user.regno}` : user?.role === 'organizer' ? 'Organizer' : 'Participant'}
            </span>
          </div>
          <MoreHorizontal size={17} />
        </div>
      </div>
    </aside>
    {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
    <main className="main-area">
      <header className="topbar">
        <button className="mobile-menu icon-button" onClick={() => setSidebarOpen(true)}><Menu size={19} /></button>
        <div className="breadcrumbs"><span>EventPass</span><span>/</span><strong>{role === 'organizer' ? page.charAt(0).toUpperCase() + page.slice(1) : 'Your events'}</strong></div>
        <div className="top-actions">
          {user ? (
            <button className="button button-outline" style={{ padding: '4px 10px', fontSize: '12px' }} onClick={logout}>Sign out ({userName})</button>
          ) : (
            <button className="button button-dark" style={{ padding: '4px 12px', fontSize: '12px' }} onClick={() => openLoginModal(role)}>Sign in</button>
          )}
          <button className="icon-button"><Bell size={17} /></button>
          <ThemeToggle dark={dark} setDark={setDark} />
          <div className="top-avatar">{userInitials}</div>
        </div>
      </header>
      {children}
    </main>
  </div>
}

function StatCard({ label, value, change, icon: Icon }: any) { return <div className="stat-card"><div className="stat-top"><span>{label}</span><div className="stat-icon"><Icon size={17} /></div></div><strong className="stat-value">{value}</strong><div className="stat-change"><span className="up">↗ {change}</span> <span>vs last month</span></div></div> }

function EventCard({ event, onRegister, onUnregister, onDelete, registered, isOrganizer }: any) { 
  return <div className="event-card">
    <div className={`event-cover ${event.color || 'blue'}`}>
      <span>{event.type || 'General'}</span>
      <div className="cover-lines"><span /> <span /></div>
      <div className="cover-title">{event.title}</div>
    </div>
    <div className="event-card-body">
      <div className="event-card-title">
        <div>
          <h3>{event.title}</h3>
          {event.event_number && <small style={{ color: 'var(--muted-foreground)', fontWeight: 600 }}>ID: {event.event_number}</small>}
          <p>{event.description}</p>
        </div>
        <button className="more-button"><MoreHorizontal size={17} /></button>
      </div>
      <div className="event-meta">
        <span><CalendarDays size={15} />{event.date}</span>
        <span><Clock3 size={15} />{event.time}</span>
        <span><ExternalLink size={15} />{event.location}</span>
      </div>
      <div className="event-footer">
        <span className="attendee-count"><Users size={15} />{event.attendees || 0} attending</span>
        {isOrganizer ? (
          <button className="button button-outline" onClick={onDelete} style={{ borderColor: '#ef4444', color: '#ef4444' }}>
            Delete Event
          </button>
        ) : registered ? (
          <button className="button button-outline" onClick={onUnregister} style={{ borderColor: '#ef4444', color: '#ef4444' }}>
            Unregister
          </button>
        ) : (
          <button className="button button-dark" onClick={onRegister}>
            Register Event <ArrowRight size={15} />
          </button>
        )}
      </div>
    </div>
  </div> 
}

function LoginModal({ close, defaultTab, onLoginSuccess, isForced = false }: { close: () => void; defaultTab: 'organizer' | 'participant'; onLoginSuccess: (user: any) => void; isForced?: boolean }) {
  const [tab, setTab] = useState<'organizer' | 'participant'>(defaultTab)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [orgId, setOrgId] = useState('')
  const [orgPassword, setOrgPassword] = useState('')
  const [regno, setRegno] = useState('')
  const [participantPassword, setParticipantPassword] = useState('')

  // Autofill last used organizer ID from localStorage
  function autofillOrganizer() {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('eventpass-last-organizer-id') : null
    if (saved) {
      setOrgId(saved)
    } else {
      setOrgId('OrganizerAcess')
    }
    setOrgPassword('Organizer123')
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      let payload: any
      if (tab === 'organizer') {
        payload = { action: 'organizer_login', organizer_id: orgId, password: orgPassword }
      } else {
        payload = { action: 'participant_login', regno: regno.trim(), password: participantPassword }
      }

      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Authentication failed')
        setLoading(false)
        return
      }

      // Save last organizer ID for autofill
      if (tab === 'organizer' && typeof window !== 'undefined') {
        localStorage.setItem('eventpass-last-organizer-id', orgId)
      }

      onLoginSuccess(data.user)
      close()
    } catch (err: any) {
      setError(err.message || 'An error occurred during sign in')
      setLoading(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    padding: '10px 14px', borderRadius: '8px',
    border: '1px solid var(--border)', background: 'var(--card)',
    color: 'var(--foreground)', fontSize: '14px', width: '100%', boxSizing: 'border-box',
  }
  const labelStyle: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', fontWeight: 600,
  }

  return <div className="modal-backdrop" role="dialog" aria-modal="true">
    <div className="auth-card modal-form" style={{ width: 'min(100%, 480px)', margin: 'auto' }}>
      <div className="panel-heading" style={{ marginBottom: '16px' }}>
        <div>
          <p className="eyebrow">EVENTPASS AUTHENTICATION</p>
          <h2>Sign in to Continue</h2>
        </div>
        {!isForced && <button type="button" className="icon-button" aria-label="Close" onClick={close}>×</button>}
      </div>

      {/* Role tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', background: 'var(--card)', borderRadius: '10px', padding: '4px', border: '1px solid var(--border)' }}>
        <button
          style={{
            flex: 1, padding: '9px', borderRadius: '7px', border: 'none', cursor: 'pointer',
            fontWeight: 700, fontSize: '13px', transition: 'all 0.2s',
            background: tab === 'organizer' ? 'var(--foreground)' : 'transparent',
            color: tab === 'organizer' ? 'var(--background)' : 'var(--muted-foreground)',
          }}
          type="button"
          onClick={() => { setTab('organizer'); setError('') }}
        >
          Participant
        </button>
        <button
          style={{
            flex: 1, padding: '9px', borderRadius: '7px', border: 'none', cursor: 'pointer',
            fontWeight: 700, fontSize: '13px', transition: 'all 0.2s',
            background: tab === 'participant' ? 'var(--foreground)' : 'transparent',
            color: tab === 'participant' ? 'var(--background)' : 'var(--muted-foreground)',
          }}
          type="button"
          onClick={() => { setTab('participant'); setError('') }}
        >
          Participant
        </button>
      </div>

      <form onSubmit={submit} className="auth-form" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {tab === 'organizer' ? (
          <>
            {/* Secure autofill banner */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 14px', borderRadius: '8px',
              background: 'rgba(78, 166, 188, 0.1)', border: '1px solid rgba(78, 166, 188, 0.3)',
              fontSize: '12px', color: 'var(--muted-foreground)',
            }}>
              <span>Secure Organizer Login</span>
              <button
                type="button"
                onClick={autofillOrganizer}
                style={{
                  fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '5px',
                  border: '1px solid rgba(78,166,188,0.5)', background: 'transparent',
                  color: '#4ea6bc', cursor: 'pointer',
                }}
              >
                Autofill
              </button>
            </div>
            <label style={labelStyle}>
              Organizer ID *
              <input
                type="text"
                placeholder="OrganizerAcess"
                value={orgId}
                onChange={(e) => setOrgId(e.target.value)}
                required
                autoComplete="username"
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              Password *
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Password"
                  value={orgPassword}
                  onChange={(e) => setOrgPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  style={{ ...inputStyle, paddingRight: '56px' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px',
                    color: 'var(--muted-foreground)', fontWeight: 600, padding: 0
                  }}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </label>
          </>
        ) : (
          <>
            <div style={{
              padding: '10px 14px', borderRadius: '8px',
              background: 'rgba(139, 92, 246, 0.08)', border: '1px solid rgba(139, 92, 246, 0.2)',
              fontSize: '12px', color: 'var(--muted-foreground)',
            }}>
              Enter your Registration Number and password to access your events. First-time logins will automatically register the password.
            </div>
            <label style={labelStyle}>
              Register Number *
              <input
                type="text"
                placeholder="e.g. 2026-REG-104"
                value={regno}
                onChange={(e) => setRegno(e.target.value)}
                required
                autoComplete="username"
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              Password *
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={participantPassword}
                  onChange={(e) => setParticipantPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  style={{ ...inputStyle, paddingRight: '56px' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px',
                    color: 'var(--muted-foreground)', fontWeight: 600, padding: 0
                  }}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </label>
          </>
        )}

        {error && <p className="form-error" role="alert" style={{ color: '#ef4444', fontSize: '13px', margin: 0, padding: '8px 12px', background: 'rgba(239,68,68,0.08)', borderRadius: '6px', border: '1px solid rgba(239,68,68,0.2)' }}>{error}</p>}

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '4px' }}>
          {!isForced && <button type="button" className="button button-outline" onClick={close}>Cancel</button>}
          <button className="button button-dark" disabled={loading} id="login-submit-btn">
            {loading ? 'Authenticating...' : tab === 'organizer' ? 'Sign in as Organizer' : 'Sign in as Participant'}
          </button>
        </div>
      </form>
    </div>
  </div>
}

function CreateEventModal({ close, refresh }: { close: () => void; refresh: () => void }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccessMsg('')

    const formData = new FormData(e.currentTarget)
    const values = Object.fromEntries(formData)

    try {
      const res = await fetch('/api/events/public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to create event in Supabase')
        setLoading(false)
        return
      }

      setSuccessMsg('Event successfully saved to Supabase!')
      refresh()
      setTimeout(() => {
        close()
      }, 1200)
    } catch (err: any) {
      setError(err.message || 'An error occurred while connecting to Supabase')
      setLoading(false)
    }
  }

  return <div className="modal-backdrop" role="dialog" aria-modal="true">
    <form className="create-event-form modal-form" onSubmit={submit}>
      <div className="panel-heading">
        <div>
          <p className="eyebrow">SUPABASE CONNECTED</p>
          <h2>Create New Event</h2>
        </div>
        <button type="button" className="icon-button" aria-label="Close" onClick={close}>×</button>
      </div>

      <div className="create-event-row">
        <label style={{ gridColumn: 'span 2' }}>
          Event Name *
          <input name="name" placeholder="e.g. AI Innovation Summit 2026" required minLength={2} />
        </label>
        <label>
          Event Number / Code
          <input name="event_number" placeholder="e.g. EV-2026-08" />
        </label>
      </div>

      <div className="create-event-row">
        <label>
          Date *
          <input name="event_date" type="date" required />
        </label>
        <label>
          Start Time *
          <input name="start_time" type="time" required defaultValue="09:00" />
        </label>
        <label>
          End Time
          <input name="end_time" type="time" defaultValue="17:00" />
        </label>
      </div>

      <div className="create-event-row">
        <label>
          Capacity *
          <input name="capacity" type="number" min="1" required defaultValue="250" />
        </label>
        <label>
          Event Type
          <input name="event_type" placeholder="e.g. Conference, Workshop" defaultValue="Conference" />
        </label>
        <label>
          Location
          <input name="location" placeholder="e.g. Main Hall, Tech Park" />
        </label>
      </div>

      <label>
        Event Description
        <textarea name="description" rows={3} placeholder="Describe what the event is about..." />
      </label>

      {error && <p className="form-error" style={{ color: '#ef4444', fontSize: '13px' }}>{error}</p>}
      {successMsg && <p style={{ color: '#22c55e', fontSize: '13px', fontWeight: 600 }}>{successMsg}</p>}

      <div className="scanner-controls" style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
        <button type="button" className="button button-outline" onClick={close}>Cancel</button>
        <button className="button button-dark" disabled={loading}>
          {loading ? 'Saving to Supabase...' : 'Save & Publish Event'}
        </button>
      </div>
    </form>
  </div>
}

function ParticipantHome({ registeredEvents, register, onUnregister, setPage, events, user }: any) { 
  const displayName = user?.name || user?.email || 'Participant'

  return <div className="page-content">
    <section className="welcome-row">
      <div>
        <p className="eyebrow">Supabase Realtime Workspace</p>
        <h1>Welcome, {displayName} <span className="wave">✦</span></h1>
        <p className="subhead">{user?.regno ? `Reg No: ${user.regno} · Choose an event to register.` : 'Explore available events in Supabase.'}</p>
      </div>
      <button className="button button-dark" onClick={() => setPage('explore')}><Plus size={16} />Find an event</button>
    </section>

    {events.length > 0 ? (
      <section className="featured-pass">
        <div>
          <div className="eyebrow light">FEATURED EVENT FROM SUPABASE</div>
          <h2>{events[0].title}</h2>
          <p><CalendarDays size={15} /> {events[0].date} <span>·</span> <ExternalLink size={15} /> {events[0].location}</p>
          <button className="button button-white" onClick={() => {
            if (registeredEvents[events[0].id]) {
              setPage('my-events')
            } else {
              register(events[0])
            }
          }}>
            {registeredEvents[events[0].id] ? 'View my pass' : 'Register for this event'} <ArrowRight size={15} />
          </button>
        </div>
        <div className="pass-pattern">
          <div className="pattern-circle" />
          <div className="mini-qr"><QrCode size={68} /></div>
        </div>
      </section>
    ) : null}

    <div className="section-heading">
      <div>
        <h2>Available Events in Supabase</h2>
        <p>Events published in database.</p>
      </div>
      <button className="text-button" onClick={() => setPage('explore')}>View all <ArrowRight size={15} /></button>
    </div>

    {events.length > 0 ? (
      <div className="event-grid">
        {events.slice(0, 2).map((event: any) => (
          <EventCard 
            key={event.id} 
            event={event} 
            registered={Boolean(registeredEvents[event.id])} 
            onRegister={() => register(event)} 
            onUnregister={() => onUnregister(event)}
          />
        ))}
      </div>
    ) : (
      <div className="panel" style={{ padding: '40px', textAlign: 'center', color: 'var(--muted-foreground)' }}>
        <h3>No events created yet in Supabase</h3>
        <p>Switch to Organizer mode to create and publish your first event.</p>
      </div>
    )}
  </div> 
}

function Explore({ registeredEvents, register, onUnregister, events }: any) { 
  return <div className="page-content">
    <section className="page-heading">
      <div>
        <p className="eyebrow">DISCOVER</p>
        <h1>Find your next event.</h1>
        <p className="subhead">Live events fetched directly from Supabase database.</p>
      </div>
      <div className="search-box"><Search size={16} /><input placeholder="Search events..." /></div>
    </section>
    
    {events.length > 0 ? (
      <div className="event-grid three">
        {events.map((event: any) => (
          <EventCard 
            key={event.id} 
            event={event} 
            registered={Boolean(registeredEvents[event.id])} 
            onRegister={() => register(event)} 
            onUnregister={() => onUnregister(event)}
          />
        ))}
      </div>
    ) : (
      <div className="panel" style={{ padding: '40px', textAlign: 'center', color: 'var(--muted-foreground)' }}>
        <h3>No published events found in Supabase</h3>
        <p>Use the "Create event" form to add events to the database.</p>
      </div>
    )}
  </div> 
}

function downloadTicketQR(svgId: string, filename: string, label: string) {
  const svgEl = document.getElementById(svgId) as SVGElement | null
  if (!svgEl) return

  const svgData = new XMLSerializer().serializeToString(svgEl)
  const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(svgBlob)

  const img = new Image()
  img.onload = () => {
    const canvas = document.createElement('canvas')
    const size = 300
    const padding = 20
    const labelHeight = 40
    canvas.width = size + padding * 2
    canvas.height = size + padding * 2 + labelHeight

    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, padding, padding, size, size)
      ctx.fillStyle = '#000000'
      ctx.font = 'bold 16px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(label, canvas.width / 2, size + padding + 28)

      const pngUrl = canvas.toDataURL('image/png')
      const downloadLink = document.createElement('a')
      downloadLink.href = pngUrl
      downloadLink.download = `${filename}.png`
      document.body.appendChild(downloadLink)
      downloadLink.click()
      document.body.removeChild(downloadLink)
    }
    URL.revokeObjectURL(url)
  }
  img.src = url
}

function MyEvents({ registeredEvents, events, user, people, onUnregister }: any) { 
  const registeredList = events.filter((e: any) => Boolean(registeredEvents[e.id]))

  if (registeredList.length === 0) {
    return <div className="page-content">
      <section className="page-heading">
        <div>
          <p className="eyebrow">YOUR TICKETS</p>
          <h1>My events</h1>
          <p className="subhead">No events registered yet.</p>
        </div>
      </section>
      <div className="panel" style={{ padding: '40px', textAlign: 'center', color: 'var(--muted-foreground)' }}>
        <h3>No registered tickets found</h3>
        <p>Go to "Find an event" or "Explore events" and click "Register Event" to get your pass.</p>
      </div>
    </div>
  }

  return <div className="page-content">
    <section className="page-heading">
      <div>
        <p className="eyebrow">YOUR TICKETS ({registeredList.length})</p>
        <h1>My events</h1>
        <p className="subhead">Your registered tickets saved in Supabase.</p>
      </div>
    </section>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {registeredList.map((event: any) => {
        const reg = people?.find((p: any) => p.event_id === event.id && (p.email?.toLowerCase() === user?.email?.toLowerCase() || !user?.email))
        const qrVal = reg?.qr_payload || (reg?.id ? `${typeof window !== 'undefined' ? window.location.origin : ''}/check-in/${reg.id}` : JSON.stringify({ event_id: event.id, email: user?.email, regno: user?.regno || 'REG' }))
        const regnoLabel = reg?.regno || user?.regno || 'EV-PASS'
        const svgId = `qr-svg-${event.id}`

        return (
          <div key={event.id} className="ticket-layout">
            <div className="ticket-card">
              <div className="ticket-top">
                <div>
                  <span className="ticket-label">ADMIT ONE</span>
                  <h2>{event.title}</h2>
                  <p><CalendarDays size={15} /> {event.date} · {event.time}</p>
                  <p><ExternalLink size={15} /> {event.location}</p>
                </div>
                <div className="ticket-status"><Status>{reg?.status || 'Registered'}</Status></div>
              </div>
              <div className="ticket-divider"><i /><span /><i /></div>
              <div className="ticket-bottom">
                <div>
                  <span className="ticket-label">GUEST</span>
                  <strong>{user?.name || user?.email || 'Participant'}</strong>
                  <span>{user?.email || ''}</span>
                  {user?.regno && <div style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>Reg No: {user.regno}</div>}
                </div>
                <div className="qr-code" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 'fit-content' }}>
                  {reg?.id ? (
                    <RotatingQRCode 
                      registrationId={reg.id} 
                      eventId={event.id} 
                      regnoLabel={regnoLabel} 
                      size={180} 
                    />
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'white', padding: '6px', borderRadius: '6px' }}>
                      <QRCodeSVG 
                        id={svgId}
                        value={qrVal} 
                        size={180} 
                        includeMargin 
                      />
                      <small style={{ color: 'black', marginTop: '2px', fontWeight: 600, fontSize: '9px' }}>{regnoLabel}</small>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="side-note">
              <ShieldCheck size={20} />
              <h3>Good to go.</h3>
              <p>Your ticket is saved in Supabase. Show this QR code at the door to check in.</p>
              <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                <button className="button button-outline" onClick={() => onUnregister(event)} style={{ borderColor: '#ef4444', color: '#ef4444', flex: 1 }}>Unregister</button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  </div> 
}

function Organizer({ page, people, setPeople, events, openCreateModal, user, onDelete }: any) { 
  const [selectedEventId, setSelectedEventId] = useState<string>('all')
  const [scan, setScan] = useState(''); 
  const [scanResult, setScanResult] = useState(''); 

  const filteredPeople = selectedEventId === 'all'
    ? people
    : people.filter((p: any) => p.event === selectedEventId || p.event_id === selectedEventId)

  const checked = filteredPeople.filter((p: any) => p.status === 'Checked in').length; 

  const handleScan = () => { 
    if (!scan.trim()) return; 
    const found = people.find((p: any) => (p.id && p.id.toLowerCase() === scan.trim().toLowerCase()) || (p.regno && p.regno.toLowerCase() === scan.trim().toLowerCase())); 
    if (found) { 
      setPeople(people.map((p: any) => p.id === found.id ? {...p, status:'Checked in'} : p)); 
      setScanResult('success') 
    } else setScanResult('invalid') 
  }

  const organizerName = user?.name || user?.email || 'Organizer'

  const dashboard = <>
    <section className="welcome-row">
      <div>
        <p className="eyebrow">ORGANIZER WORKSPACE</p>
        <h1>Welcome, {organizerName} <span className="wave">✦</span></h1>
        <p className="subhead">Manage your events and live participant registrations from Supabase.</p>
      </div>
      <button className="button button-dark" onClick={openCreateModal}><Plus size={16} />Create event</button>
    </section>
    <div className="stats-grid">
      <StatCard label="Total attendees" value={String(people.length)} change="Live" icon={Users} />
      <StatCard label="Active events" value={String(events.length)} change="Supabase" icon={CalendarDays} />
      <StatCard label="Check-in rate" value={people.length ? `${Math.round((checked / people.length) * 100)}%` : '0%'} change="Realtime" icon={CheckCircle2} />
      <StatCard label="Tickets scanned" value={String(checked)} change="Door" icon={QrCode} />
    </div>
    <div className="dashboard-grid">
      <div className="panel">
        <div className="panel-heading">
          <div><h2>Recent activity</h2><p>Live participant registrations from Supabase.</p></div>
        </div>
        <div className="activity-list">
          {people.slice(0, 5).map((p: any, i: number) => (
            <div className="activity" key={p.id || i}>
              <div className="activity-avatar">{p.name ? p.name.split(' ').map((n: string) => n[0]).join('') : 'P'}</div>
              <div><strong>{p.name}</strong><span>{p.status === 'Checked in' ? 'checked in to' : 'registered for'} <b>{p.event}</b></span></div>
              <time>{i + 1}h ago</time>
            </div>
          ))}
          {people.length === 0 && <p style={{ padding: '20px', color: 'var(--muted-foreground)' }}>No participant registrations yet.</p>}
        </div>
      </div>
      <div className="panel event-summary">
        <div className="panel-heading"><div><h2>Upcoming events</h2><p>At a glance.</p></div></div>
        {events.slice(0, 5).map((e: any) => (
          <div className="summary-row" key={e.id}>
            <div className={`date-tile ${e.color || 'blue'}`}>
              <b>{e.date?.split(' ')[0] || 'TBD'}</b>
              <span>{e.date?.split(' ')[1] || ''}</span>
            </div>
            <div>
              <strong>{e.title}</strong>
              <span>{e.attendees || 0} / {e.capacity} attendees</span>
            </div>
            <ArrowRight size={15} />
          </div>
        ))}
        {events.length === 0 && <p style={{ padding: '20px', color: 'var(--muted-foreground)' }}>No events published yet in Supabase.</p>}
      </div>
    </div>
  </>

  const eventsPage = <>
    <section className="page-heading">
      <div>
        <p className="eyebrow">ORGANIZE</p>
        <h1>Your events</h1>
        <p className="subhead">Events fetched live from Supabase database.</p>
      </div>
      <button className="button button-dark" onClick={openCreateModal}><Plus size={16} />Create event</button>
    </section>
    
    {events.length > 0 ? (
      <div className="event-grid three">
        {events.map((e: any) => (
          <EventCard 
            event={e} 
            key={e.id} 
            registered={false} 
            isOrganizer={true} 
            onDelete={() => onDelete(e.id)} 
          />
        ))}
      </div>
    ) : (
      <div className="panel" style={{ padding: '40px', textAlign: 'center', color: 'var(--muted-foreground)' }}>
        <h3>No events created in Supabase yet</h3>
        <p>Click "Create event" to publish your first event to the database.</p>
      </div>
    )}
  </>

  const participants = <>
    <section className="page-heading">
      <div>
        <p className="eyebrow">PEOPLE</p>
        <h1>Participants</h1>
        <p className="subhead">{filteredPeople.length} participant registrations found in Supabase.</p>
      </div>
      <button className="button button-outline"><Download size={15} />Export CSV</button>
    </section>
    <div className="panel table-panel">
      <div className="table-tools" style={{ display: 'flex', gap: '12px', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '12px', flex: 1 }}>
          <div className="search-box" style={{ flex: 1 }}><Search size={16} /><input placeholder="Search participants..." /></div>
          
          {/* PARTICIPANTS EVENT SELECTION DROPDOWN */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>Select Event:</span>
            <select 
              value={selectedEventId} 
              onChange={(e) => setSelectedEventId(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'var(--card)',
                color: 'var(--foreground)',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              <option value="all">All Events ({people.length})</option>
              {events.map((e: any) => (
                <option key={e.id} value={e.title}>
                  {e.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button className="filter"><Filter size={14} /> Filter</button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Reg No</th>
              <th>Participant</th>
              <th>Event</th>
              <th>Registered Date</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filteredPeople.map((p: any, idx: number) => (
              <tr key={p.id || idx}>
                <td><strong style={{ fontSize: '12px', color: 'var(--muted-foreground)' }}>{p.regno || 'REG-' + (1020 + idx)}</strong></td>
                <td>
                  <div className="person-cell">
                    <div className="activity-avatar">{p.name ? p.name.split(' ').map((n: string) => n[0]).join('') : 'P'}</div>
                    <div><strong>{p.name}</strong><span>{p.email}</span></div>
                  </div>
                </td>
                <td>{p.event}</td>
                <td>{p.registered || 'Just now'}</td>
                <td><Status>{p.status || 'Registered'}</Status></td>
                <td><MoreHorizontal size={16} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredPeople.length === 0 && (
          <div style={{ padding: '30px', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '14px' }}>
            No participants found in Supabase for the selected event.
          </div>
        )}
      </div>
    </div>
  </>

  const scanner = <>
    <section className="page-heading">
      <div>
        <p className="eyebrow">DOOR CONTROL</p>
        <h1>Check-in scanner</h1>
        <p className="subhead">Validate tickets and welcome your guests.</p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted-foreground)' }}>Scanning for:</span>
        <select 
          value={selectedEventId} 
          onChange={(e) => setSelectedEventId(e.target.value)}
          style={{
            padding: '6px 10px',
            borderRadius: '6px',
            border: '1px solid var(--border)',
            background: 'var(--card)',
            color: 'var(--foreground)',
            fontSize: '12px',
            fontWeight: 500,
          }}
        >
          <option value="all">Auto-Detect (All Events)</option>
          {events.map((e: any) => (
            <option key={e.id} value={e.id}>{e.title}</option>
          ))}
        </select>
      </div>
    </section>
    <OrganizerScanner eventId={selectedEventId} />
  </>

  return <div className="page-content">
    {page === 'overview' ? dashboard : page === 'events' ? eventsPage : page === 'participants' ? participants : page === 'scanner' ? scanner : <AnalyticsDashboard events={events} />}
  </div> 
}

function formatTimeWithAmPm(timeStr?: string | null) {
  if (!timeStr) return ''
  if (/am|pm/i.test(timeStr)) return timeStr
  const parts = timeStr.split(':')
  let hour = parseInt(parts[0], 10)
  if (isNaN(hour)) return timeStr
  const minute = parts[1] || '00'
  const ampm = hour >= 12 ? 'PM' : 'AM'
  hour = hour % 12 || 12
  return `${hour}:${minute} ${ampm}`
}

export default function Page() { 
  const [role, setRole] = useState<'participant'|'organizer'>('organizer'); 
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [page, setPage] = useState('overview'); 
  const [dark, setDark] = useState(false); 
  const [registeredEvents, setRegisteredEvents] = useState<Record<string, boolean>>({}); 
  const [people, setPeople] = useState<any[]>([]); 
  const [eventsList, setEventsList] = useState<any[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginModalTab, setLoginModalTab] = useState<'organizer' | 'participant'>('participant');
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [pendingEvent, setPendingEvent] = useState<any>(null);

  const fetchSupabaseEvents = async () => {
    try {
      const res = await fetch('/api/events/public')
      if (res.ok) {
        const data = await res.json()
        if (data.events && Array.isArray(data.events)) {
          const dbEvents = data.events.map((e: any) => {
            const startFormatted = formatTimeWithAmPm(e.start_time)
            const endFormatted = formatTimeWithAmPm(e.end_time)
            const timeDisplay = startFormatted
              ? (endFormatted ? `${startFormatted} – ${endFormatted}` : startFormatted)
              : 'All Day'

            return {
              id: e.id,
              title: e.name,
              event_number: e.event_number || 'EV-' + e.id.slice(0, 4).toUpperCase(),
              date: e.event_date ? new Date(e.event_date).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : 'TBD',
              time: timeDisplay,
              location: e.location || 'TBA',
              type: e.event_type || 'General',
              attendees: 0,
              capacity: e.capacity,
              color: 'blue',
              description: e.description || 'No description provided.',
            }
          })
          setEventsList(dbEvents)
        }
      }
    } catch (e) {
      console.error('Failed to fetch events from Supabase', e)
    }
  }

  const fetchParticipants = async () => {
    try {
      const res = await fetch('/api/participants')
      if (res.ok) {
        const data = await res.json()
        if (data.registrations && Array.isArray(data.registrations)) {
          const dbPeople = data.registrations.map((r: any) => ({
            id: r.id,
            regno: r.profiles?.regno || 'REG-' + r.id.slice(0, 4).toUpperCase(),
            name: r.profiles?.full_name || 'Participant',
            email: r.profiles?.email || '',
            event: r.events?.name || 'Event',
            event_id: r.event_id,
            registered: r.registered_at ? new Date(r.registered_at).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : 'Today',
            status: r.status === 'registered' ? 'Registered' : r.status || 'Registered',
            qr_payload: r.qr_payload,
            qr_status: r.qr_status,
          }))
          setPeople(dbPeople)

          // Auto-mark registered events if logged in user is in registrations
          if (currentUser?.email || currentUser?.regno) {
            const userRegs = dbPeople.filter((p: any) => {
              if (currentUser.email && p.email && p.email.toLowerCase() === currentUser.email.toLowerCase()) return true
              if (currentUser.regno && p.regno && p.regno.toLowerCase() === currentUser.regno.toLowerCase()) return true
              if (currentUser.id && p.participant_id && p.participant_id === currentUser.id) return true
              return false
            })
            const regMap: Record<string, boolean> = {}
            userRegs.forEach((r: any) => {
              if (r.event_id) regMap[r.event_id] = true
            })
            if (Object.keys(regMap).length > 0) {
              setRegisteredEvents(prev => ({ ...prev, ...regMap }))
            }
          }
        }
      }
    } catch (e) {
      console.error('Failed to fetch participants', e)
    }
  }

  useEffect(() => { 
    fetchSupabaseEvents()
    fetchParticipants()

    // Check server-side session first (JWT cookie)
    fetch('/api/auth/session')
      .then((res) => res.json())
      .then((data) => {
        if (data.user) {
          setCurrentUser(data.user)
          const restoredRole = data.user.role || 'organizer'
          setRole(restoredRole)
          setPage(restoredRole === 'organizer' ? 'overview' : 'home')
          localStorage.setItem('eventpass-user', JSON.stringify(data.user))
        } else {
          // Fallback: check localStorage
          const savedUser = localStorage.getItem('eventpass-user')
          if (savedUser) {
            try {
              const u = JSON.parse(savedUser)
              setCurrentUser(u)
              const restoredRole = u.role || 'organizer'
              setRole(restoredRole)
              setPage(restoredRole === 'organizer' ? 'overview' : 'home')
            } catch (e) {}
          }
        }
      })
      .catch(() => {
        // Server session unavailable — use localStorage
        const savedUser = localStorage.getItem('eventpass-user')
        if (savedUser) {
          try {
            const u = JSON.parse(savedUser)
            setCurrentUser(u)
            const restoredRole = u.role || 'organizer'
            setRole(restoredRole)
            setPage(restoredRole === 'organizer' ? 'overview' : 'home')
          } catch (e) {}
        }
      })
      .finally(() => {
        setAuthLoading(false)
      })

    const savedDemo = localStorage.getItem('eventpass-demo'); 
    if (savedDemo) { 
      const data = JSON.parse(savedDemo); 
      if (data.registeredEvents) setRegisteredEvents(data.registeredEvents);
    } 
  }, []); 

  useEffect(() => { 
    localStorage.setItem('eventpass-demo', JSON.stringify({ registeredEvents })) 
  }, [registeredEvents]); 

  useEffect(() => { 
    document.documentElement.classList.toggle('dark', dark) 
  }, [dark]); 

  // Auto-sync registered events for logged in user (by regno, email, or profile id)
  useEffect(() => {
    if (currentUser && people.length > 0) {
      const userRegs = people.filter((p: any) => {
        if (currentUser.email && p.email && p.email.toLowerCase() === currentUser.email.toLowerCase()) return true
        if (currentUser.regno && p.regno && p.regno.toLowerCase() === currentUser.regno.toLowerCase()) return true
        if (currentUser.id && p.participant_id && p.participant_id === currentUser.id) return true
        return false
      })
      const regMap: Record<string, boolean> = {}
      userRegs.forEach((r: any) => {
        if (r.event_id) regMap[r.event_id] = true
      })
      if (Object.keys(regMap).length > 0) {
        setRegisteredEvents(prev => ({ ...prev, ...regMap }))
      }
    }
  }, [currentUser, people])

  const performRegistration = async (eventObj: any, userObj: any) => {
    try {
      const res = await fetch('/api/participants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'register_event',
          regno: userObj.regno || userObj.user_metadata?.regno,
          name: userObj.name || userObj.full_name || userObj.email,
          email: userObj.email,
          event_id: eventObj.id,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        if (res.status === 409 || data.error?.includes('EVENT_FULL') || data.error?.includes('full')) {
          alert('Seat not available. This event has reached maximum capacity set in Supabase.')
        } else if (data.error?.includes('ALREADY_REGISTERED')) {
          alert('You are already registered for this event.')
        } else {
          alert(`Registration failed: ${data.error || 'Unknown error'}`)
        }
        return
      }

      // Mark event as registered in state and local storage
      setRegisteredEvents(prev => {
        const next = { ...prev, [eventObj.id]: true }
        localStorage.setItem('eventpass-demo', JSON.stringify({ registeredEvents: next }))
        return next
      })
      
      // Refresh participants from Supabase
      await fetchParticipants()

      // Increment event attendee count locally
      setEventsList(prev => prev.map(e => e.id === eventObj.id ? { ...e, attendees: (e.attendees || 0) + 1 } : e))
      
      setPage('my-events')
    } catch (e) {
      console.error('Failed to register for event', e)
      alert('Network error while registering for event.')
    }
  }

  const performUnregistration = async (eventObj: any, userObj: any) => {
    try {
      await fetch('/api/participants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'unregister_event',
          email: userObj.email,
          event_id: eventObj.id,
        }),
      })

      // Unmark event as registered in state and local storage
      setRegisteredEvents(prev => {
        const next = { ...prev }
        delete next[eventObj.id]
        localStorage.setItem('eventpass-demo', JSON.stringify({ registeredEvents: next }))
        return next
      })
      
      // Refresh participants from Supabase
      await fetchParticipants()

      // Decrement event attendee count locally
      setEventsList(prev => prev.map(e => e.id === eventObj.id ? { ...e, attendees: Math.max(0, (e.attendees || 1) - 1) } : e))
    } catch (e) {
      console.error('Failed to unregister from event', e)
    }
  }

  const unregisterFromEvent = async (eventObj: any) => {
    if (!currentUser) return
    if (!confirm('Are you sure you want to unregister from this event?')) return
    await performUnregistration(eventObj, currentUser)
  }

  const deleteEvent = async (eventId: string) => {
    if (!confirm('Are you sure you want to delete this event? This will also delete all registrations associated with it.')) return
    try {
      const res = await fetch(`/api/events/public?id=${eventId}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        // Refresh event list and participants from Supabase
        await fetchSupabaseEvents()
        await fetchParticipants()
      } else {
        const err = await res.json()
        alert(err.error || 'Failed to delete event')
      }
    } catch (e) {
      console.error('Failed to delete event', e)
    }
  }


  const registerForEvent = async (eventObj: any) => {
    // If not logged in as participant, set role to participant and open login modal
    if (!currentUser || currentUser.role !== 'participant') {
      setRole('participant')
      setPendingEvent(eventObj)
      setLoginModalTab('participant')
      setShowLoginModal(true)
      return
    }

    await performRegistration(eventObj, currentUser)
  }

  const handleLoginSuccess = async (userData: any) => {
    setCurrentUser(userData)
    const resolvedRole = userData.role || 'participant'
    setRole(resolvedRole)
    setPage(resolvedRole === 'organizer' ? 'overview' : 'home')
    localStorage.setItem('eventpass-user', JSON.stringify(userData))
    await fetchParticipants()

    // If user clicked Register Event before signing in, complete registration now!
    if (pendingEvent) {
      const ev = pendingEvent
      setPendingEvent(null)
      await performRegistration(ev, userData)
    }
  }

  const handleLogout = async () => {
    // Clear server-side session cookie
    await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'logout' }),
    }).catch(() => {})
    setCurrentUser(null)
    localStorage.removeItem('eventpass-user')
    setRegisteredEvents({})
    setPage('overview')
  }

  const switchRole = (r: any) => { 
    setRole(r); 
    setPage(r === 'organizer' ? 'overview' : 'home') 
  }; 

  if (authLoading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', background: 'var(--card)' }}>
        <p style={{ fontWeight: 600, color: 'var(--muted-foreground)' }}>Verifying session...</p>
      </div>
    )
  }

  if (!currentUser) {
    return (
      <main className="auth-page" style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', background: 'var(--card)' }}>
        <LoginModal 
          close={() => {}} 
          defaultTab={loginModalTab} 
          onLoginSuccess={handleLoginSuccess}
          isForced={true}
        />
      </main>
    )
  }

  return <>
    <AppShell 
      role={role} 
      setRole={switchRole} 
      dark={dark} 
      setDark={setDark} 
      page={page} 
      setPage={setPage}
      user={currentUser}
      openLoginModal={(tab: 'organizer' | 'participant') => { setLoginModalTab(tab); setShowLoginModal(true); }}
      logout={handleLogout}
      sidebarOpen={sidebarOpen}
      setSidebarOpen={setSidebarOpen}
    >
      {role === 'participant' ? (
        page === 'home' ? <ParticipantHome registeredEvents={registeredEvents} register={registerForEvent} onUnregister={unregisterFromEvent} setPage={setPage} events={eventsList} user={currentUser} /> 
        : page === 'explore' ? <Explore registeredEvents={registeredEvents} register={registerForEvent} onUnregister={unregisterFromEvent} events={eventsList} /> 
        : <MyEvents registeredEvents={registeredEvents} events={eventsList} user={currentUser} people={people} onUnregister={unregisterFromEvent} />
      ) : (
        <Organizer 
          page={page} 
          people={people} 
          setPeople={setPeople} 
          events={eventsList} 
          openCreateModal={() => setShowCreateModal(true)} 
          user={currentUser}
          onDelete={deleteEvent}
        />
      )}
    </AppShell>

    {showCreateModal && <CreateEventModal close={() => setShowCreateModal(false)} refresh={fetchSupabaseEvents} />}
    {showLoginModal && (
      <LoginModal 
        close={() => setShowLoginModal(false)} 
        defaultTab={loginModalTab} 
        onLoginSuccess={handleLoginSuccess} 
      />
    )}
  </> 
}


