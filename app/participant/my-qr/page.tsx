'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { RotatingQRCode } from '@/components/rotating-qr'

export default function MyQrPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [registrations, setRegistrations] = useState<any[]>([])

  useEffect(() => {
    const supabase = createSupabaseBrowserClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push('/')
        return
      }
      setUser(user)
      
      // Fetch registrations
      supabase
        .from('registrations')
        .select('id,qr_payload,qr_status,qr_expires_at,event_id,events(name,event_date,start_time,location)')
        .eq('participant_id', user.id)
        .order('registered_at', { ascending: false })
        .then(({ data }) => {
          setRegistrations(data ?? [])
          setLoading(false)
        })
    })
  }, [router])

  if (loading) {
    return <main className="qr-page"><div style={{ display: 'flex', justifyContent: 'center', padding: '100px' }}>Loading your secure passes...</div></main>
  }

  return (
    <main className="qr-page">
      <div className="qr-page-head">
        <div>
          <p className="eyebrow">MY QR</p>
          <h1>Your event passes</h1>
          <p className="subhead">Each pass is unique and rotates every 30 seconds for security.</p>
        </div>
        <a className="button button-outline" href="/">Back to workspace</a>
      </div>
      <div className="qr-pass-grid">
        {registrations?.map((registration: any) => {
          const regnoLabel = user?.user_metadata?.regno || 'EV-PASS'
          return (
            <article className="qr-pass" key={registration.id}>
              <div>
                <p className="ticket-label">REGISTRATION PASS</p>
                <h2>{registration.events?.name ?? 'Event'}</h2>
                <p>{registration.events?.event_date} · {registration.events?.start_time}</p>
                <p>{registration.events?.location}</p>
              </div>
              <div className="qr-code-large" style={{ display: 'flex', justifyContent: 'center', background: 'transparent' }}>
                <RotatingQRCode 
                  registrationId={registration.id} 
                  eventId={registration.event_id} 
                  regnoLabel={regnoLabel} 
                  size={180} 
                />
              </div>
              <div className="qr-pass-meta">
                <span>Status <strong>{registration.qr_status === 'active' ? 'Active / Valid' : registration.qr_status}</strong></span>
                <span>Registration <strong>{registration.id.slice(0, 8)}</strong></span>
              </div>
              <p className="qr-warning">Do not share this QR. It rotates every 30s and is scanned securely at the door.</p>
            </article>
          )
        })}
        {!registrations?.length && (
          <div className="empty-state">
            <h2>No passes yet</h2>
            <p>Register for an event to receive your unique QR pass.</p>
            <a className="button button-dark" href="/">Explore events</a>
          </div>
        )}
      </div>
    </main>
  )
}
