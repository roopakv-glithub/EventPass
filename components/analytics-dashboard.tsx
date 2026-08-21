'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, Bot, ChevronDown, LoaderCircle, RefreshCw, Send, Users } from 'lucide-react'
import { Bar, Doughnut } from 'react-chartjs-2'
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js'

ChartJS.register(
  ArcElement,
  BarElement,
  CategoryScale,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
)

type EventRecord = {
  id: string
  title: string
  date: string
  attendees: number
  capacity: number
}

type AnalyticsDatum = {
  labels: string[]
  checkIns: number[]
  registered: number
  checkedIn: number
}

export type LiveAnalyticsDatum = AnalyticsDatum

type ChatMessage = { role: 'user' | 'assistant'; content: string }

const faqQuestions = [
  'How many people have checked in so far?',
  'What percentage of registered attendees are no-shows?',
  'What time did check-ins peak?',
  'How many spots are left?',
]

function buildAnswer(question: string, event: EventRecord, data: AnalyticsDatum) {
  const noShows = data.registered - data.checkedIn
  const peak = Math.max(...data.checkIns)
  const peakIndex = data.checkIns.indexOf(peak)
  const spotsLeft = Math.max(event.capacity - data.registered, 0)
  const noShowRate = data.registered ? Math.round((noShows / data.registered) * 100) : 0

  if (question.startsWith('How many people')) return `${data.checkedIn.toLocaleString()} people have checked in to ${event.title}.`
  if (question.startsWith('What percentage')) return `${noShowRate}% of registered attendees are currently no-shows (${noShows.toLocaleString()} people).`
  if (question.startsWith('What time')) return peak > 0 ? `Check-ins peaked at ${data.labels[peakIndex]} with ${peak} participants.` : 'No check-ins recorded yet.'
  return `${spotsLeft.toLocaleString()} spots are left for ${event.title}.`
}

export function AnalyticsDashboard({ events, liveData = {} }: { events: EventRecord[]; liveData?: Record<string, LiveAnalyticsDatum> }) {
  const [selectedEventId, setSelectedEventId] = useState(events[0]?.id ?? '')
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [liveAnalytics, setLiveAnalytics] = useState<Record<string, AnalyticsDatum>>({})
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)

  const event = events.find((item) => item.id === selectedEventId) ?? events[0]

  // Merge: prefer live Supabase data over passed-in liveData over local cache
  const data: AnalyticsDatum = useMemo(() => {
    if (event && liveAnalytics[event.id]) return liveAnalytics[event.id]
    if (event && liveData[event.id]) return liveData[event.id]
    return { labels: [], checkIns: [], registered: 0, checkedIn: 0 }
  }, [event, liveAnalytics, liveData])

  const peak = data.checkIns.length ? Math.max(...data.checkIns) : 0
  const checkInRate = data.registered ? Math.round((data.checkedIn / data.registered) * 100) : 0

  // ── Fetch analytics from Supabase ───────────────────────────
  const fetchAnalytics = useCallback(async (eventId: string) => {
    if (!eventId) return
    setAnalyticsLoading(true)
    try {
      const res = await fetch(`/api/analytics?event_id=${eventId}`)
      if (!res.ok) return
      const json = await res.json()
      setLiveAnalytics((prev) => ({
        ...prev,
        [eventId]: {
          labels: json.labels ?? [],
          checkIns: json.checkIns ?? [],
          registered: Number(json.registered ?? 0),
          checkedIn: Number(json.checked_in ?? 0),
        },
      }))
      setLastRefreshed(new Date())
    } catch (e) {
      console.error('Analytics fetch failed', e)
    } finally {
      setAnalyticsLoading(false)
    }
  }, [])

  // Fetch when event changes
  useEffect(() => {
    if (selectedEventId) fetchAnalytics(selectedEventId)
  }, [selectedEventId, fetchAnalytics])

  // Auto-refresh every 60 seconds
  useEffect(() => {
    if (!selectedEventId) return
    const interval = setInterval(() => fetchAnalytics(selectedEventId), 60_000)
    return () => clearInterval(interval)
  }, [selectedEventId, fetchAnalytics])

  const barData = useMemo(() => ({
    labels: data.labels,
    datasets: [{
      label: 'Check-ins',
      data: data.checkIns,
      backgroundColor: 'rgba(78, 166, 188, 0.82)',
      borderColor: '#4ea6bc',
      borderWidth: 1,
      borderRadius: 5,
      borderSkipped: false,
      maxBarThickness: 34,
    }],
  }), [data])

  const doughnutData = useMemo(() => ({
    labels: ['Checked in', 'Not checked in'],
    datasets: [{
      data: [data.checkedIn, Math.max(data.registered - data.checkedIn, 0)],
      backgroundColor: ['#4ea6bc', 'rgba(148, 163, 184, 0.2)'],
      borderColor: ['#4ea6bc', 'transparent'],
      borderWidth: 2,
      hoverOffset: 4,
    }],
  }), [data])

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: { padding: 10, displayColors: false, callbacks: { label: (context: any) => `${context.parsed.y} participants` } },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#8b9aaa', font: { size: 11 } } },
      y: { beginAtZero: true, grid: { color: 'rgba(148, 163, 184, 0.13)' }, ticks: { color: '#8b9aaa', precision: 0, font: { size: 11 } }, border: { display: false } },
    },
  }

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '72%',
    plugins: { legend: { display: false }, tooltip: { padding: 10 } },
  }

  const submitQuestion = (value = question) => {
    const trimmed = value.trim()
    if (!trimmed || !event) return
    setQuestion('')
    setMessages((current) => [...current, { role: 'user', content: trimmed }])
    setLoading(true)
    fetch('/api/ai/event-insights', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: event.id, question: trimmed }) })
      .then(async (response) => {
        const result = await response.json()
        if (!response.ok) throw new Error(result.error ?? 'AI request failed')
        setMessages((current) => [...current, { role: 'assistant', content: result.answer ?? buildAnswer(trimmed, event, data) }])
      })
      .catch(() => setMessages((current) => [...current, { role: 'assistant', content: buildAnswer(trimmed, event, data) }]))
      .finally(() => setLoading(false))
  }

  return <div className="analytics-page">
    <section className="page-heading analytics-heading">
      <div><p className="eyebrow">PERFORMANCE · LIVE DATA</p><h1>Event analytics</h1><p className="subhead">Live data from Supabase — charts update every 60 seconds.</p></div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <label className="event-selector"><span>Analyzing event</span><select value={selectedEventId} onChange={(current) => { setSelectedEventId(current.target.value); setMessages([]) }} aria-label="Select event to analyze">{events.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select><ChevronDown size={15} /></label>
        <button
          className="button button-outline"
          onClick={() => fetchAnalytics(selectedEventId)}
          disabled={analyticsLoading}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', fontSize: '12px' }}
        >
          <RefreshCw size={13} className={analyticsLoading ? 'spin' : ''} />
          {analyticsLoading ? 'Loading...' : 'Refresh'}
        </button>
      </div>
    </section>

    {lastRefreshed && (
      <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginBottom: '8px', marginTop: '-4px' }}>
        Last updated: {lastRefreshed.toLocaleTimeString()} · Auto-refreshes every 60s
      </p>
    )}

    <div className="analytics-summary">
      <div><span>Selected event</span><strong>{event?.title}</strong><small>{event?.date}</small></div>
      <div><span>Registered</span><strong>{analyticsLoading ? '…' : data.registered.toLocaleString()}</strong></div>
      <div><span>Checked in</span><strong>{analyticsLoading ? '…' : data.checkedIn.toLocaleString()}</strong></div>
      <div><span>Check-in rate</span><strong>{analyticsLoading ? '…' : `${checkInRate}%`}</strong></div>
      <div><span>Peak period</span><strong>{data.labels[data.checkIns.indexOf(peak)] ?? '—'}</strong></div>
    </div>

    <div className="analytics-chart-grid">
      <section className="panel chart-panel analytics-bar-panel">
        <div className="panel-heading">
          <div><h2>Check-ins over time</h2><p>Hourly check-in activity during {event?.title}.</p></div>
          <span className="chart-legend"><i />Participants</span>
        </div>
        <div className="analytics-bar-chart">
          {analyticsLoading ? (
            <div className="chart-empty"><LoaderCircle size={20} className="spin" />Loading live data...</div>
          ) : data.checkIns.length ? (
            <Bar data={barData} options={barOptions} />
          ) : (
            <div className="chart-empty">No check-in activity recorded yet. Check-ins will appear here once scanning starts.</div>
          )}
        </div>
      </section>
      <section className="panel chart-panel doughnut-panel">
        <div className="panel-heading"><div><h2>Registration health</h2><p>Registered vs checked in (live).</p></div></div>
        <div className="doughnut-wrap">
          {analyticsLoading ? (
            <div className="chart-empty"><LoaderCircle size={20} className="spin" />Loading...</div>
          ) : data.registered ? (
            <>
              <Doughnut data={doughnutData} options={doughnutOptions} />
              <div className="doughnut-center"><strong>{data.checkedIn.toLocaleString()}</strong><span>checked in</span></div>
            </>
          ) : (
            <div className="chart-empty">No registration data yet.</div>
          )}
        </div>
        <div className="doughnut-legend">
          <span><i className="checked" />Checked in <b>{data.checkedIn.toLocaleString()}</b></span>
          <span><i className="remaining" />Not checked in <b>{Math.max(data.registered - data.checkedIn, 0).toLocaleString()}</b></span>
        </div>
      </section>
    </div>

    <section className="ai-analytics panel"><div className="ai-heading"><div className="ai-icon"><Bot size={19} /></div><div><h2>Ask about this event</h2><p>Get quick answers from the attendance data for {event?.title}.</p></div><span className="ai-ready"><span />Ready</span></div><div className="chat-window" aria-live="polite">{messages.length === 0 && !loading ? <div className="chat-empty"><Bot size={23} /><strong>Ask a question about {event?.title}</strong><span>Try one of the questions below or ask in your own words.</span></div> : messages.map((message, index) => <div className={`chat-message ${message.role}`} key={`${message.role}-${index}`}><div className="message-avatar">{message.role === 'assistant' ? <Bot size={14} /> : 'JD'}</div><p>{message.content}</p></div>)}{loading && <div className="chat-message assistant"><div className="message-avatar"><Bot size={14} /></div><p className="loading-answer"><LoaderCircle size={14} />Analyzing attendance data...</p></div>}</div><form className="chat-form" onSubmit={(current) => { current.preventDefault(); submitQuestion() }}><input value={question} onChange={(current) => setQuestion(current.target.value)} placeholder="Ask about registrations or check-ins..." aria-label="Ask a question about the selected event" /><button className="button button-dark" type="submit" disabled={loading || !question.trim()}><Send size={15} />Ask AI</button></form><div className="faq-list"><div className="faq-label"><span>Frequently asked</span><small>About {event?.title}</small></div><div className="faq-buttons">{faqQuestions.map((faq) => <button key={faq} onClick={() => submitQuestion(faq)} disabled={loading}><span>{faq}</span><ArrowUpRight size={14} /></button>)}</div></div></section>

    <div className="analytics-footnote"><Users size={15} /> Live data from Supabase · Showing real-time registrations and check-ins.</div>
  </div>
}
