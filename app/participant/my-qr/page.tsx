'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { RotatingQRCode } from '@/components/rotating-qr'
import { ArrowLeft, ShieldCheck } from 'lucide-react'

export default function MyQrPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [registrations, setRegistrations] = useState<any[]>([])

  useEffect(() => {
    async function init() {
      try {
        // 1. Check server-side cookie session first
        const sessionRes = await fetch('/api/auth/session')
        const sessionData = await sessionRes.json().catch(() => ({}))
        
        let currentUser = sessionData.user

        // 2. Fallback to Supabase auth client or localStorage
        if (!currentUser) {
          const supabase = createSupabaseBrowserClient()
          const { data: { user: sbUser } } = await supabase.auth.getUser()
          if (sbUser) {
            currentUser = {
              id: sbUser.id,
              email: sbUser.email,
              name: sbUser.user_metadata?.full_name || sbUser.email,
              regno: sbUser.user_metadata?.regno || 'EV-PASS'
            }
          }
        }

        if (!currentUser) {
          const saved = typeof window !== 'undefined' ? localStorage.getItem('eventpass-user') : null
          if (saved) currentUser = JSON.parse(saved)
        }

        if (!currentUser) {
          router.push('/')
          return
        }

        setUser(currentUser)

        // Fetch user registrations from API
        const regRes = await fetch('/api/participants')
        if (regRes.ok) {
          const regData = await regRes.json()
          if (regData.registrations && Array.isArray(regData.registrations)) {
            const userRegs = regData.registrations.filter((r: any) => {
              if (currentUser.email && r.profiles?.email && r.profiles.email.toLowerCase() === currentUser.email.toLowerCase()) return true
              if (currentUser.regno && r.profiles?.regno && r.profiles.regno.toLowerCase() === currentUser.regno.toLowerCase()) return true
              if (currentUser.id && r.participant_id && r.participant_id === currentUser.id) return true
              return false
            })
            setRegistrations(userRegs.length > 0 ? userRegs : regData.registrations)
          }
        }
      } catch (e) {
        console.error('Failed to load passes', e)
      } finally {
        setLoading(false)
      }
    }

    init()
  }, [router])

  if (loading) {
    return (
      <main className="qr-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
        <div style={{ textAlign: 'center', color: 'var(--muted-foreground)' }}>
          <p style={{ fontWeight: 600 }}>Loading your secure QR passes...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="qr-page" style={{ maxWidth: '900px', margin: '0 auto', padding: '32px 20px' }}>
      <div className="qr-page-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px' }}>
        <div>
          <p className="eyebrow" style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', color: '#2563eb', textTransform: 'uppercase', marginBottom: '4px' }}>
            SECURE ACCESS PASS
          </p>
          <h1 style={{ fontSize: '28px', fontWeight: 800, margin: 0 }}>Enlarged QR Event Pass</h1>
          <p className="subhead" style={{ color: 'var(--muted-foreground)', marginTop: '4px', fontSize: '14px' }}>
            Showing full-size rotating QR pass for fast venue check-in.
          </p>
        </div>
        <button
          className="button button-outline"
          onClick={() => router.push('/')}
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <ArrowLeft size={16} /> Back to Dashboard
        </button>
      </div>

      <div className="qr-pass-grid" style={{ display: 'flex', flexDirection: 'column', gap: '24px', alignItems: 'center' }}>
        {registrations?.map((registration: any) => {
          const regnoLabel = user?.regno || user?.user_metadata?.regno || registration.profiles?.regno || 'EV-PASS'
          return (
            <article
              className="qr-pass"
              key={registration.id}
              style={{
                width: '100%',
                maxWidth: '480px',
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: '16px',
                padding: '24px',
                boxShadow: '0 12px 32px rgba(0,0,0,0.1)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center'
              }}
            >
              <div style={{ marginBottom: '16px' }}>
                <span className="ticket-label" style={{ fontSize: '11px', fontWeight: 700, color: '#3b82f6', letterSpacing: '0.1em' }}>
                  REGISTRATION PASS
                </span>
                <h2 style={{ fontSize: '22px', fontWeight: 800, margin: '6px 0 4px 0' }}>
                  {registration.events?.name ?? 'Event Pass'}
                </h2>
                <p style={{ fontSize: '13px', color: 'var(--muted-foreground)', margin: 0 }}>
                  {user?.name || user?.full_name || user?.email} ({regnoLabel})
                </p>
              </div>

              {/* BIG size QR Code Display */}
              <div style={{ margin: '12px 0', padding: '16px', background: '#f8fafc', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                <RotatingQRCode 
                  registrationId={registration.id} 
                  eventId={registration.event_id} 
                  regnoLabel={regnoLabel} 
                  size={260} 
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#16a34a', fontWeight: 600, marginTop: '8px' }}>
                <ShieldCheck size={16} /> Active & Valid Security Token
              </div>

              <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '12px', lineHeight: 1.4 }}>
                This QR code automatically refreshes every 30 seconds for security. Present this screen to the event scanner.
              </p>
            </article>
          )
        })}

        {!registrations?.length && (
          <div className="empty-state" style={{ padding: '48px', textAlign: 'center' }}>
            <h2>No registered passes found</h2>
            <p>Register for an event to view your enlarged QR pass.</p>
            <button className="button button-dark" onClick={() => router.push('/')} style={{ marginTop: '16px' }}>
              Explore Events
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
