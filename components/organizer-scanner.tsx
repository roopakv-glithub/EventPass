'use client'

import { useEffect, useRef, useState } from 'react'
import { Camera, CheckCircle2, CloudOff, ImagePlus, LoaderCircle, RefreshCw, Upload, Wifi, XCircle } from 'lucide-react'
import { queueCheckIn, readPendingCheckIns, syncPendingCheckIns } from '@/lib/scanner/offline-queue'

type ScanState = 'idle' | 'starting' | 'scanning' | 'success' | 'already_checked_in' | 'invalid_qr' | 'wrong_event' | 'expired' | 'network_error' | 'permission_denied'

export function OrganizerScanner({ eventId }: { eventId: string }) {
  const scannerRef = useRef<any>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<ScanState>('idle')
  const [message, setMessage] = useState('Start the camera or upload a QR image to check in attendees.')
  const [online, setOnline] = useState(true)
  const [pending, setPending] = useState(0)
  const [mode, setMode] = useState<'camera' | 'upload'>('camera')
  const [uploadPreview, setUploadPreview] = useState<string | null>(null)

  useEffect(() => {
    setPending(readPendingCheckIns().length)
    const onlineHandler = () => setOnline(true)
    const offlineHandler = () => setOnline(false)
    window.addEventListener('online', onlineHandler)
    window.addEventListener('offline', offlineHandler)
    return () => { window.removeEventListener('online', onlineHandler); window.removeEventListener('offline', offlineHandler); scannerRef.current?.stop().catch(() => undefined) }
  }, [])

  async function validate(token: string) {
    if (!navigator.onLine) {
      setPending(queueCheckIn({ token, eventId }).length)
      setState('network_error')
      setMessage('Offline Mode: this check-in is queued for sync.')
      return
    }
    try {
      const response = await fetch('/api/check-ins', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, event_id: eventId }) })
      const result = await response.json()

      // Show real server errors (401, 400, 500, etc.)
      if (!response.ok && !result.status) {
        setState('invalid_qr')
        setMessage(`Error ${response.status}: ${result.error || result.message || 'Check-in failed'}`)
        return
      }

      const s = result.status ?? (response.ok ? 'success' : 'invalid_qr')
      setState(s)
      setMessage(
        s === 'checked_in' || s === 'success' ? `✅ Check-in Successful${result.participant ? `: ${result.participant}` : ''}` :
        s === 'already_checked_in' ? `Already Checked In${result.checked_in_at ? ` at ${new Date(result.checked_in_at).toLocaleTimeString()}` : ''}` :
        s === 'wrong_event' ? 'This QR belongs to another event.' :
        s === 'expired' ? 'This QR code has expired.' :
        result.error ? `Error: ${result.error}` :
        'Invalid QR code. No matching registration found.'
      )
    } catch (err) {
      setPending(queueCheckIn({ token, eventId }).length)
      setState('network_error')
      setMessage(`Network failure: ${String(err)}`)
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
      setMessage('Camera unavailable or permission was denied. Try uploading a QR image instead.')
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // Show preview
    const previewUrl = URL.createObjectURL(file)
    setUploadPreview(previewUrl)
    setState('starting')
    setMessage('Decoding QR code from image...')

    try {
      const { Html5Qrcode } = await import('html5-qrcode')
      const scanner = new Html5Qrcode('eventpass-qr-upload-reader')
      const decodedText = await scanner.scanFile(file, /* showImage= */ false)
      await validate(decodedText)
    } catch {
      setState('invalid_qr')
      setMessage('Could not detect a QR code in this image. Please try a clearer photo.')
    }

    // Reset file input so user can re-upload same file
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function clearUpload() {
    setUploadPreview(null)
    setState('idle')
    setMessage('Start the camera or upload a QR image to check in attendees.')
  }

  async function sync() {
    setMessage('Syncing pending check-ins...')
    const remaining = await syncPendingCheckIns()
    setPending(remaining.length)
    setMessage(remaining.length ? `${remaining.length} check-ins still need to sync.` : 'All check-ins synced.')
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

  return (
    <section className="scanner-feature panel">
      {/* Header */}
      <div className="scanner-feature-head">
        <div>
          <p className="eyebrow">SECURE VALIDATION</p>
          <h2>Event scanner</h2>
        </div>
        <span className={online ? 'scanner-connectivity online' : 'scanner-connectivity offline'}>
          {online ? <Wifi size={14} /> : <CloudOff size={14} />}{online ? 'Online' : 'Offline'}
        </span>
      </div>

      {/* Mode Tabs */}
      <div className="scanner-mode-tabs">
        <button
          className={`scanner-tab ${mode === 'camera' ? 'active' : ''}`}
          onClick={() => { setMode('camera'); clearUpload() }}
        >
          <Camera size={15} /> Scan with Camera
        </button>
        <button
          className={`scanner-tab ${mode === 'upload' ? 'active' : ''}`}
          onClick={() => { setMode('upload'); scannerRef.current?.stop().catch(() => undefined); setState('idle') }}
        >
          <ImagePlus size={15} /> Upload QR Image
        </button>
      </div>

      {/* Camera Mode */}
      {mode === 'camera' && (
        <>
          <div id="eventpass-qr-reader" className="qr-reader" aria-label="QR camera scanner">
            <div className="scan-frame">
              <Camera size={27} />
              <span>{state === 'starting' ? 'Starting camera...' : state === 'scanning' ? 'Ready to scan' : 'Camera scanner'}</span>
            </div>
          </div>
          <div className="scanner-controls">
            <button className="button button-dark" onClick={start} disabled={state === 'starting' || state === 'scanning'}>
              {state === 'starting' ? 'Starting...' : state === 'scanning' ? 'Scanning...' : 'Start scanning'}
            </button>
          </div>
        </>
      )}

      {/* Upload Mode */}
      {mode === 'upload' && (
        <>
          <div
            className="qr-upload-zone"
            onClick={() => fileInputRef.current?.click()}
          >
            {uploadPreview ? (
              <div className="upload-preview">
                <img src={uploadPreview} alt="Uploaded QR" />
                <button className="upload-clear" onClick={(e) => { e.stopPropagation(); clearUpload() }}>
                  <XCircle size={18} /> Remove
                </button>
              </div>
            ) : (
              <div className="upload-placeholder">
                <Upload size={32} />
                <span>Click to upload a QR code image</span>
                <small>Supports JPG, PNG, WEBP</small>
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />
          {/* Hidden element for html5-qrcode file scan */}
          <div id="eventpass-qr-upload-reader" style={{ display: 'none' }} />
        </>
      )}

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
    </section>
  )
}

