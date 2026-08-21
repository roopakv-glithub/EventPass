'use client'

import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { RefreshCw, ShieldCheck } from 'lucide-react'

type RotatingQRCodeProps = {
  registrationId: string
  eventId: string
  regnoLabel: string
  size?: number
}

export function RotatingQRCode({ registrationId, eventId, regnoLabel, size = 180 }: RotatingQRCodeProps) {
  const [qrValue, setQrValue] = useState('')
  const [secondsLeft, setSecondsLeft] = useState(30)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    async function getNewToken() {
      try {
        const res = await fetch('/api/qr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'token',
            registration_id: registrationId,
            event_id: eventId,
            interval_seconds: 30,
          }),
        })
        if (res.ok && active) {
          const data = await res.json()
          if (data.token) {
            setQrValue(JSON.stringify({
              reg_id: registrationId,
              token: data.token,
              event_id: eventId,
            }))
            const expires = new Date(data.expires_at).getTime()
            const now = Date.now()
            const diff = Math.max(0, Math.floor((expires - now) / 1000))
            setSecondsLeft(diff)
            setLoading(false)
          }
        }
      } catch (err) {
        console.error('Error fetching rotating token:', err)
      }
    }

    getNewToken()

    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          getNewToken()
          return 30
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      active = false
      clearInterval(timer)
    }
  }, [registrationId, eventId])

  const progressPercent = Math.max(0, Math.min(100, (secondsLeft / 30) * 100))

  if (loading) {
    return (
      <div style={{
        width: `${size}px`,
        height: `${size + 40}px`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(255, 255, 255, 0.05)',
        borderRadius: '12px',
        border: '1px dashed var(--border)',
        fontSize: '12px',
        color: 'var(--muted-foreground)',
        gap: '8px'
      }}>
        <RefreshCw size={20} className="spin" />
        <span>Generating Secure QR...</span>
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      background: '#ffffff',
      padding: '14px',
      borderRadius: '14px',
      width: 'fit-content',
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
      border: '1px solid rgba(0,0,0,0.08)'
    }}>
      {/* Bigger QR Code Display */}
      <QRCodeSVG value={qrValue} size={size} includeMargin={true} />

      {/* Reg No Label */}
      <div style={{
        marginTop: '8px',
        fontSize: '11px',
        fontWeight: 700,
        color: '#1e293b',
        letterSpacing: '0.05em',
        fontFamily: 'monospace'
      }}>
        {regnoLabel}
      </div>

      {/* Countdown Timer & Progress Bar below QR */}
      <div style={{
        width: '100%',
        marginTop: '10px',
        paddingTop: '8px',
        borderTop: '1px solid #f1f5f9',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '6px'
      }}>
        {/* Progress Bar Container */}
        <div style={{
          width: '100%',
          height: '5px',
          background: '#e2e8f0',
          borderRadius: '10px',
          overflow: 'hidden'
        }}>
          <div style={{
            height: '100%',
            width: `${progressPercent}%`,
            background: secondsLeft < 8 ? '#ef4444' : '#3b82f6',
            transition: 'width 1s linear, background-color 0.3s ease',
            borderRadius: '10px'
          }} />
        </div>

        {/* Timer Text */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          fontSize: '11px',
          fontWeight: 600,
          color: '#475569'
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: '#64748b' }}>
            <ShieldCheck size={12} style={{ color: '#22c55e' }} /> Auto-refreshing
          </span>
          <span style={{
            color: secondsLeft < 8 ? '#dc2626' : '#2563eb',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontFamily: 'monospace'
          }}>
            <RefreshCw size={11} className="spin" style={{ animationDuration: `${secondsLeft}s` }} />
            {secondsLeft}s
          </span>
        </div>
      </div>
    </div>
  )
}
