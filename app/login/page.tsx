'use client'

import { FormEvent, useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [role, setRole] = useState<'participant' | 'organizer'>('participant')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')
    const supabase = createSupabaseBrowserClient()
    const result = mode === 'login'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { data: { role, full_name: email.split('@')[0] } } })
    setLoading(false)
    if (result.error) {
      setError('Invalid credentials or account details. Please try again.')
      return
    }
    if (mode === 'signup' && !result.data.session) {
      setMessage('Check your email to confirm your account, then sign in.')
      return
    }
    router.push(role === 'organizer' ? '/organizer' : '/participant')
    router.refresh()
  }

  return <main className="auth-page"><div className="auth-card"><p className="eyebrow">EVENTPASS</p><h1>{mode === 'login' ? 'Welcome back.' : 'Create your account.'}</h1><p className="subhead">{mode === 'login' ? 'Sign in to continue to your events.' : 'Choose your workspace and get started.'}</p><div className="auth-role-switch"><button className={role === 'participant' ? 'active' : ''} onClick={() => setRole('participant')} type="button">Participant</button><button className={role === 'organizer' ? 'active' : ''} onClick={() => setRole('organizer')} type="button">Organizer</button></div><form onSubmit={submit} className="auth-form"><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>{error && <p className="form-error" role="alert">{error}</p>}{message && <p className="form-success" role="status">{message}</p>}<button className="button button-dark" disabled={loading} type="submit">{loading ? 'Signing in...' : mode === 'login' ? 'Sign in' : 'Create account'}</button></form><button className="auth-switch" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError('') }} type="button">{mode === 'login' ? 'Need an account? Sign up' : 'Already have an account? Sign in'}</button></div></main>
}
