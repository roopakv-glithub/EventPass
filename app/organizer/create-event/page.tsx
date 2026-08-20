'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function CreateEventPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError('')
    const values = Object.fromEntries(new FormData(event.currentTarget))
    const response = await fetch('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...values, capacity: Number(values.capacity) }) })
    if (!response.ok) { const result = await response.json(); setError(result.error ?? 'Could not create event'); setLoading(false); return }
    router.push('/organizer')
  }
  return <main className="event-detail-page"><a className="text-button" href="/organizer">← Back to dashboard</a><section className="event-detail-hero"><p className="eyebrow">ORGANIZE</p><h1>Create event</h1><p className="subhead">Set the essentials first. You can publish when the details are ready.</p></section><form className="create-event-form" onSubmit={submit}><label>Event name<input name="name" required minLength={2} /></label><div className="create-event-row"><label>Date<input name="event_date" type="date" required /></label><label>Start time<input name="start_time" type="time" required /></label><label>End time<input name="end_time" type="time" /></label></div><label>Capacity<input name="capacity" type="number" min="1" required /></label><label>Location<input name="location" /></label><label>Description<textarea name="description" rows={5} /></label>{error && <p className="form-error" role="alert">{error}</p>}<div className="scanner-controls"><a className="button button-outline" href="/organizer">Cancel</a><button className="button button-dark" disabled={loading} type="submit">{loading ? 'Creating...' : 'Create event'}</button></div></form></main>
}
