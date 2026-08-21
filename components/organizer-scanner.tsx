'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Activity, Camera, CheckCircle2, CloudOff, LoaderCircle,
  RefreshCw, Wifi, XCircle, Users, Clock,
} from 'lucide-react'
import { queueCheckIn, readPendingCheckIns } from '@/lib/scanner/offline-queue'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'

type ScanState = 'idle' | 'starting' | 'scanning' | 'success' | 'already_checked_in' | 'invalid_qr' | 'wrong_event' | 'expired' | 'network_error' | 'permission_denied'

type LiveCheckIn = {
  id: string
  participant_name: string
  participant_regno: string
  checked_in_at: string
  event_name: string
}

type StationScan = {
  id: string
  token: string
  eventId: string
  status: ScanState | 'success' | 'checked_in'
  timestamp: string
  participantName: string
  participantRegno: string
}

const LOCAL_SCAN_LOG_KEY = 'eventpass-station-scan-log'

export function OrganizerScanner({ eventId }: { eventId: string }) {
  const scannerRef = useRef<any>(null)
  const [state, setState] = useState<ScanState>('idle')
  const [message, setMessage] = useState('Start the camera scanner to check in attendees.')
  const [online, setOnline] = useState(true)
  const [pending, setPending] = useState(0)

  // Live dashboard state
  const [liveCount, setLiveCount] = useState(0)
  const [totalRegistered, setTotalRegistered] = useState(0)
  const [recentCheckIns, setRecentCheckIns] = useState<LiveCheckIn[]>([])
  const [realtimeStatus, setRealtimeStatus] = useState<'connecting' | 'connected' | 'error'>('connecting')
  const [newScanFlash, setNewScanFlash] = useState(false)

  // Station scan log history (local storage)
  const [stationScans, setStationScans] = useState<StationScan[]>([])

  // Load local scan history from localStorage
  const loadLocalScanLog = useCallback(() => {
    if (typeof window === 'undefined') return
    try {
      const saved = localStorage.getItem(LOCAL_SCAN_LOG_KEY)
      if (saved) {
        setStationScans(JSON.parse(saved))
      }
    } catch (e) {
      console.error('Failed to load local scan log', e)
    }
  }, [])

  // Save scan history to localStorage
  const saveLocalScanLog = (updatedScans: StationScan[]) => {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(LOCAL_SCAN_LOG_KEY, JSON.stringify(updatedScans))
      setStationScans(updatedScans)
    } catch (e) {
      console.error('Failed to save local scan log', e)
    }
  }

  // Fetch initial counts
  const fetchCounts = useCallback(async () => {
    if (!eventId || eventId === 'all') return
    try {
      const checkinRes = await fetch(`/api/analytics?event_id=${eventId}`)
      if (checkinRes.ok) {
        const data = await checkinRes.json()
        setLiveCount(Number(data.checked_in ?? 0))
        setTotalRegistered(Number(data.registered ?? 0))
      }
    } catch {}
  }, [eventId])

  // Fetch recent check-ins
  const fetchRecentCheckIns = useCallback(async () => {
    if (!eventId || eventId === 'all') return
    try {
      const supabase = createSupabaseBrowserClient()
      const { data } = await supabase
        .from('check_ins')
        .select(`
          id,
          checked_in_at,
          event_id,
          registration_id,
          registrations ( participant_id, profiles ( full_name, regno ) ),
          events ( name )
        `)
        .eq('event_id', eventId)
        .order('checked_in_at', { ascending: false })
        .limit(10)

      if (data) {
        const mapped: LiveCheckIn[] = data.map((c: any) => ({
          id: c.id,
          participant_name: c.registrations?.profiles?.full_name ?? 'Unknown',
          participant_regno: c.registrations?.profiles?.regno ?? '',
          checked_in_at: c.checked_in_at,
          event_name: c.events?.name ?? '',
        }))
        setRecentCheckIns(mapped)
      }
    } catch {}
  }, [eventId])

  // Sync offline check-ins
  const sync = useCallback(async () => {
    setMessage('Syncing pending check-ins...')
    const pendingItems = readPendingCheckIns()
    if (pendingItems.length === 0) {
      setMessage('No pending check-ins to sync.')
      return
    }

    const remaining: typeof pendingItems = []
    let updatedScans = typeof window !== 'undefined'
      ? JSON.parse(localStorage.getItem(LOCAL_SCAN_LOG_KEY) ?? '[]') as StationScan[]
      : []

    for (const item of pendingItems) {
      try {
        const response = await fetch('/api/check-ins', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: item.token, event_id: item.eventId }),
        })
        const result = await response.json()
        const s = result.status ?? (response.ok ? 'success' : 'invalid_qr')

        // Update the log entry corresponding to this token and status = 'pending'
        const matchIdx = updatedScans.findIndex((sc) => sc.token === item.token && sc.status === 'pending')
        if (matchIdx !== -1) {
          updatedScans[matchIdx] = {
            ...updatedScans[matchIdx],
            status: s,
            participantName: result.participant || updatedScans[matchIdx].participantName,
            participantRegno: result.regno || 'Synced',
          }
        }
      } catch (err) {
        remaining.push(item)
      }
    }

    // Save updated local scans to state and localStorage
    saveLocalScanLog(updatedScans)

    // Update pending queue in localStorage
    localStorage.setItem('eventpass-pending-check-ins', JSON.stringify(remaining))
    setPending(remaining.length)

    if (remaining.length === 0) {
      setMessage('All check-ins successfully synced! Tick marks updated.')
    } else {
      setMessage(`${remaining.length} check-ins failed to sync. Will retry later.`)
    }

    // Trigger counts & recent check-ins refresh
    fetchCounts()
    fetchRecentCheckIns()
  }, [eventId, fetchCounts, fetchRecentCheckIns])

  // Supabase Realtime subscription
  useEffect(() => {
    fetchCounts()
    fetchRecentCheckIns()

    const supabase = createSupabaseBrowserClient()

    const channel = supabase
      .channel(`scanner-checkins-${eventId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'check_ins',
          filter: eventId !== 'all' ? `event_id=eq.${eventId}` : undefined,
        },
        async (payload) => {
          setNewScanFlash(true)
          setTimeout(() => setNewScanFlash(false), 2000)

          setLiveCount((prev) => prev + 1)

          try {
            const { data: checkIn } = await supabase
              .from('check_ins')
              .select(`
                id,
                checked_in_at,
                registrations ( profiles ( full_name, regno ) ),
                events ( name )
              `)
              .eq('id', payload.new.id)
              .maybeSingle()

            if (checkIn) {
              const newEntry: LiveCheckIn = {
                id: checkIn.id,
                participant_name: (checkIn.registrations as any)?.profiles?.full_name ?? 'Unknown',
                participant_regno: (checkIn.registrations as any)?.profiles?.regno ?? '',
                checked_in_at: checkIn.checked_in_at,
                event_name: (checkIn.events as any)?.name ?? '',
              }
              setRecentCheckIns((prev) => [newEntry, ...prev].slice(0, 10))
            }
          } catch {}
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setRealtimeStatus('connected')
        else if (status === 'CHANNEL_ERROR') setRealtimeStatus('error')
        else setRealtimeStatus('connecting')
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [eventId, fetchCounts, fetchRecentCheckIns])

  useEffect(() => {
    setPending(readPendingCheckIns().length)
    loadLocalScanLog()

    const onlineHandler = () => {
      setOnline(true)
      sync()
    }
    const offlineHandler = () => setOnline(false)

    window.addEventListener('online', onlineHandler)
    window.addEventListener('offline', offlineHandler)

    return () => {
      window.removeEventListener('online', onlineHandler)
      window.removeEventListener('offline', offlineHandler)
      scannerRef.current?.stop().catch(() => undefined)
    }
  }, [loadLocalScanLog, sync])

  async function validate(token: string) {
    let parsedName = 'Attendee'
    let parsedRegno = 'Offline'
    try {
      const payload = JSON.parse(token)
      if (payload.reg_id) {
        parsedRegno = `Reg: ${payload.reg_id.slice(0, 8)}`
      }
    } catch {}

    if (!navigator.onLine) {
      const updatedQueue = queueCheckIn({ token, eventId })
      setPending(updatedQueue.length)
      setState('network_error')
      setMessage('Offline Mode: this check-in is queued for sync.')

      const newScan: StationScan = {
        id: crypto.randomUUID(),
        token,
        eventId,
        status: 'pending',
        timestamp: new Date().toISOString(),
        participantName: parsedName,
        participantRegno: parsedRegno,
      }
      const updatedLog = [newScan, ...stationScans]
      saveLocalScanLog(updatedLog)
      return
    }

    try {
      const response = await fetch('/api/check-ins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, event_id: eventId }),
      })
      const result = await response.json()

      if (!response.ok && !result.status) {
        setState('invalid_qr')
        setMessage(`Error ${response.status}: ${result.error || result.message || 'Check-in failed'}`)

        const newScan: StationScan = {
          id: crypto.randomUUID(),
          token,
          eventId,
          status: 'invalid_qr',
          timestamp: new Date().toISOString(),
          participantName: parsedName,
          participantRegno: parsedRegno,
        }
        const updatedLog = [newScan, ...stationScans]
        saveLocalScanLog(updatedLog)
        return
      }

      const s = result.status ?? (response.ok ? 'success' : 'invalid_qr')
      setState(s)
      setMessage(
        s === 'checked_in' || s === 'success' ? `Check-in Successful${result.participant ? `: ${result.participant}` : ''}` :
        s === 'already_checked_in' ? `Already Checked In${result.checked_in_at ? ` at ${new Date(result.checked_in_at).toLocaleTimeString()}` : ''}` :
        s === 'wrong_event' ? 'This QR belongs to another event.' :
        s === 'expired' ? 'This QR code has expired.' :
        result.error ? `Error: ${result.error}` :
        'Invalid QR code. No matching registration found.'
      )

      const newScan: StationScan = {
        id: crypto.randomUUID(),
        token,
        eventId,
        status: s,
        timestamp: new Date().toISOString(),
        participantName: result.participant || parsedName,
        participantRegno: result.regno || parsedRegno,
      }
      const updatedLog = [newScan, ...stationScans]
      saveLocalScanLog(updatedLog)

      if (s === 'checked_in' || s === 'success') {
        setTimeout(fetchRecentCheckIns, 1000)
      }
    } catch (err) {
      const updatedQueue = queueCheckIn({ token, eventId })
      setPending(updatedQueue.length)
      setState('network_error')
      setMessage(`Network failure: ${String(err)}`)

      const newScan: StationScan = {
        id: crypto.randomUUID(),
        token,
        eventId,
        status: 'pending',
        timestamp: new Date().toISOString(),
        participantName: parsedName,
        participantRegno: parsedRegno,
      }
      const updatedLog = [newScan, ...stationScans]
      saveLocalScanLog(updatedLog)
    }
  }

  async function start() {
    setState('starting')
    try {
      const { Html5Qrcode } = await import('html5-qrcode')
      const scanner = new Html5Qrcode('eventpass-qr-reader')
      scannerRef.current = scanner
      await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 240, height: 240 } }, async (decodedText: string) => { await scanner.stop(); await validate(decodedText) }, () => undefined)
      setState('scanning')
      setMessage('Camera ready. Center an attendee QR code in the frame.')
    } catch (error) {
      setState(String(error).toLowerCase().includes('permission') ? 'permission_denied' : 'network_error')
      setMessage('Camera unavailable or permission was denied. Please check camera settings.')
    }
  }

  const feedbackIcon = state === 'starting' ? <LoaderCircle className="spin" size={17} />
    : state === 'success' || state === 'already_checked_in' ? <CheckCircle2 size={17} />
    : state === 'invalid_qr' || state === 'expired' || state === 'wrong_event' ? <XCircle size={17} />
    : <Wifi size={17} />

  const feedbackColor = state === 'success' ? 'success'
    : state === 'already_checked_in' ? 'warning'
    : state === 'invalid_qr' || state === 'expired' || state === 'wrong_event' || state === 'permission_denied' ? 'error'
    : state === 'network_error' ? 'offline'
    : ''

  const checkInRate = totalRegistered > 0 ? Math.round((liveCount / totalRegistered) * 100) : 0

  return (
    <div className="scanner-layout" style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '20px', alignItems: 'start' }}>
      {/* ── Scanner Panel ── */}
      <section className="scanner-feature panel">
        {/* Header */}
        <div className="scanner-feature-head" style={{ marginBottom: '16px' }}>
          <div>
            <p className="eyebrow">SECURE VALIDATION</p>
            <h2>Event scanner</h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              fontSize: '11px', fontWeight: 600,
              color: realtimeStatus === 'connected' ? '#22c55e' : realtimeStatus === 'error' ? '#ef4444' : '#f59e0b',
            }}>
              <span style={{
                width: '7px', height: '7px', borderRadius: '50%',
                background: realtimeStatus === 'connected' ? '#22c55e' : realtimeStatus === 'error' ? '#ef4444' : '#f59e0b',
                display: 'inline-block',
                animation: realtimeStatus === 'connected' ? 'pulse 2s infinite' : undefined,
              }} />
              {realtimeStatus === 'connected' ? 'Live' : realtimeStatus === 'error' ? 'Offline' : 'Connecting...'}
            </span>
            <span className={online ? 'scanner-connectivity online' : 'scanner-connectivity offline'}>
              {online ? <Wifi size={14} /> : <CloudOff size={14} />}{online ? 'Online' : 'Offline'}
            </span>
          </div>
        </div>

        {/* Camera Mode */}
        <div id="eventpass-qr-reader" className="qr-reader" aria-label="QR camera scanner">
          <div className="scan-frame">
            <Camera size={27} />
            <span>{state === 'starting' ? 'Starting camera...' : state === 'scanning' ? 'Ready to scan' : 'Camera scanner'}</span>
          </div>
        </div>
        <div className="scanner-controls" style={{ marginTop: '16px' }}>
          <button className="button button-dark" onClick={start} disabled={state === 'starting' || state === 'scanning'}>
            {state === 'starting' ? 'Starting...' : state === 'scanning' ? 'Scanning...' : 'Start scanning'}
          </button>
        </div>

        {/* Feedback */}
        <div className={`scanner-feedback ${feedbackColor}`}>
          <span>{feedbackIcon}</span>
          <p>{message}</p>
        </div>

        {/* Sync / Pending */}
        <div className="scanner-controls">
          {pending > 0 && (
            <button className="button button-outline" onClick={sync}>
              <RefreshCw size={14} />Sync {pending}
            </button>
          )}
        </div>
        {pending > 0 && (
          <p className="scanner-queue">
            <CloudOff size={14} /> Offline Mode: {pending} check-in{pending === 1 ? '' : 's'} waiting to sync.
          </p>
        )}

        {/* Local Scan History */}
        <div style={{ marginTop: '24px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Activity size={14} /> Device Scan History (Offline Persisted)
            </h3>
            {stationScans.length > 0 && (
              <button
                onClick={() => {
                  if (confirm('Clear local scan history?')) {
                    saveLocalScanLog([])
                  }
                }}
                style={{ fontSize: '11px', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Clear Log
              </button>
            )}
          </div>
          
          <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {stationScans.length === 0 ? (
              <p style={{ fontSize: '12px', color: 'var(--muted-foreground)', textAlign: 'center', padding: '16px 0' }}>
                No scans recorded on this device yet.
              </p>
            ) : (
              stationScans.map((scan) => {
                const isPending = scan.status === 'pending'
                const isSuccess = scan.status === 'success' || scan.status === 'checked_in'
                const isAlready = scan.status === 'already_checked_in'
                const isFailed = ['invalid_qr', 'expired', 'wrong_event', 'permission_denied'].includes(scan.status)

                let statusBadge = scan.status
                let badgeColor = 'var(--muted-foreground)'
                let itemIcon = <Wifi size={14} />

                if (isPending) {
                  statusBadge = 'Pending Sync'
                  badgeColor = '#f59e0b'
                  itemIcon = <LoaderCircle size={14} className="spin" />
                } else if (isSuccess) {
                  statusBadge = 'Checked In'
                  badgeColor = '#22c55e'
                  itemIcon = <CheckCircle2 size={14} />
                } else if (isAlready) {
                  statusBadge = 'Already Scanned'
                  badgeColor = '#3b82f6'
                  itemIcon = <CheckCircle2 size={14} />
                } else if (isFailed) {
                  statusBadge = scan.status === 'expired' ? 'Expired' : scan.status === 'wrong_event' ? 'Wrong Event' : 'Invalid'
                  badgeColor = '#ef4444'
                  itemIcon = <XCircle size={14} />
                }

                return (
                  <div
                    key={scan.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      background: 'rgba(255, 255, 255, 0.02)',
                      borderRadius: '6px',
                      border: '1px solid var(--border)',
                      fontSize: '12px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ color: badgeColor, display: 'flex', alignItems: 'center' }}>
                        {itemIcon}
                      </span>
                      <div>
                        <strong style={{ display: 'block' }}>{scan.participantName}</strong>
                        <span style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>
                          {scan.participantRegno} · {new Date(scan.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                    <span style={{
                      fontSize: '9px',
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: '4px',
                      background: `${badgeColor}15`,
                      color: badgeColor,
                      textTransform: 'uppercase'
                    }}>
                      {statusBadge}
                    </span>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </section>

      {/* ── Live Dashboard Panel ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Live Count Card */}
        <div
          className="panel"
          style={{
            padding: '24px',
            textAlign: 'center',
            border: newScanFlash ? '2px solid #22c55e' : '2px solid transparent',
            transition: 'border-color 0.4s ease',
          }}
        >
          <p style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--muted-foreground)', textTransform: 'uppercase', marginBottom: '8px' }}>
            Today&apos;s Check-in
          </p>
          <div style={{ fontSize: '52px', fontWeight: 800, lineHeight: 1, color: 'var(--foreground)' }}>
            {liveCount}
            <span style={{ fontSize: '22px', fontWeight: 500, color: 'var(--muted-foreground)' }}> / {totalRegistered}</span>
          </div>
          {newScanFlash && (
            <p style={{ color: '#22c55e', fontWeight: 700, fontSize: '13px', marginTop: '8px', animation: 'fadeIn 0.3s ease' }}>
              New check-in!
            </p>
          )}
          <div className="progress" style={{ marginTop: '16px', marginBottom: '8px' }}>
            <i style={{ width: `${totalRegistered ? Math.max(4, checkInRate) : 0}%`, background: '#22c55e' }} />
          </div>
          <p style={{ fontSize: '12px', color: 'var(--muted-foreground)' }}>
            {checkInRate}% · {Math.max(totalRegistered - liveCount, 0)} remaining
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center', marginTop: '12px', fontSize: '11px', color: 'var(--muted-foreground)' }}>
            <span style={{
              width: '7px', height: '7px', borderRadius: '50%',
              background: realtimeStatus === 'connected' ? '#22c55e' : '#f59e0b',
              display: 'inline-block',
            }} />
            {realtimeStatus === 'connected' ? 'Realtime connected' : 'Connecting to Realtime...'}
          </div>
        </div>

        {/* Recent Check-ins Feed */}
        <div className="panel" style={{ padding: '0', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Activity size={15} />
            <h3 style={{ fontSize: '13px', fontWeight: 700, margin: 0 }}>Live Feed</h3>
            <span style={{
              marginLeft: 'auto', fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em',
              color: realtimeStatus === 'connected' ? '#22c55e' : '#f59e0b',
            }}>
              ● LIVE
            </span>
          </div>
          <div style={{ maxHeight: '340px', overflowY: 'auto' }}>
            {recentCheckIns.length === 0 ? (
              <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '13px' }}>
                <Users size={24} style={{ marginBottom: '8px', opacity: 0.4 }} />
                <p>No check-ins yet. Scan a QR code to start.</p>
              </div>
            ) : (
              recentCheckIns.map((ci, i) => (
                <div
                  key={ci.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '10px 20px',
                    borderBottom: i < recentCheckIns.length - 1 ? '1px solid var(--border)' : 'none',
                    background: i === 0 ? 'rgba(34, 197, 94, 0.04)' : 'transparent',
                    transition: 'background 0.3s ease',
                  }}
                >
                  <div style={{
                    width: '32px', height: '32px', borderRadius: '50%',
                    background: 'var(--card)', border: '1px solid var(--border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '12px', fontWeight: 700, flexShrink: 0,
                  }}>
                    {ci.participant_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ fontSize: '13px', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ci.participant_name}
                    </strong>
                    {ci.participant_regno && (
                      <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>#{ci.participant_regno}</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 }}>
                    <CheckCircle2 size={14} color="#22c55e" />
                    <span style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <Clock size={9} />
                      {new Date(ci.checked_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <button
          className="button button-outline"
          onClick={() => { fetchCounts(); fetchRecentCheckIns() }}
          style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', width: '100%', justifyContent: 'center' }}
        >
          <RefreshCw size={13} /> Refresh data
        </button>
      </div>
    </div>
  )
}
