import { QRCodeSVG } from 'qrcode.react'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export default async function MyQrPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')
  const { data: registrations } = await supabase.from('registrations').select('id,qr_payload,qr_status,qr_expires_at,events(name,event_date,start_time,location)').eq('participant_id', user.id).order('registered_at', { ascending: false })

  return <main className="qr-page"><div className="qr-page-head"><div><p className="eyebrow">MY QR</p><h1>Your event passes</h1><p className="subhead">Each pass is unique to your registration.</p></div><a className="button button-outline" href="/">Back to workspace</a></div><div className="qr-pass-grid">{registrations?.map((registration: any) => <article className="qr-pass" key={registration.id}><div><p className="ticket-label">REGISTRATION PASS</p><h2>{registration.events?.name ?? 'Event'}</h2><p>{registration.events?.event_date} · {registration.events?.start_time}</p><p>{registration.events?.location}</p></div><div className="qr-code-large">{registration.qr_payload ? <QRCodeSVG value={registration.qr_payload} size={190} includeMargin /> : <div className="qr-pending">QR is being prepared</div>}</div><div className="qr-pass-meta"><span>Status <strong>{registration.qr_status === 'active' ? 'Active / Valid' : registration.qr_status}</strong></span><span>Registration <strong>{registration.id.slice(0, 8)}</strong></span></div><p className="qr-warning">Do not share this QR. It is a unique credential for this registration.</p></article>)}{!registrations?.length && <div className="empty-state"><h2>No passes yet</h2><p>Register for an event to receive your unique QR pass.</p><a className="button button-dark" href="/">Explore events</a></div>}</div></main>
}
