'use client'

import { useState } from 'react'

export function RegisterButton({ eventId, disabled }: { eventId: string; disabled?: boolean }) {
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'already' | 'full' | 'closed' | 'error'>('idle')
  async function register() {
    setState('loading')
    try {
      const response = await fetch('/api/registrations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId }) })
      const result = await response.json()
      if (response.ok) setState('success')
      else if (response.status === 409 && result.error?.toLowerCase().includes('already')) setState('already')
      else if (response.status === 409 && result.error?.toLowerCase().includes('full')) setState('full')
      else if (result.error?.toLowerCase().includes('closed')) setState('closed')
      else setState('error')
    } catch {
      setState('error')
    }
  }
  const label = state === 'loading' ? 'Registering...' : state === 'success' ? 'Registration successful' : state === 'already' ? 'Already registered' : state === 'full' ? 'Event full' : state === 'closed' ? 'Registration closed' : state === 'error' ? 'Try again' : 'Register'
  return <button className="button button-dark" onClick={register} disabled={disabled || state === 'loading' || state === 'success' || state === 'already' || state === 'full' || state === 'closed'}>{label}</button>
}
