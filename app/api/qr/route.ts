import { NextResponse } from 'next/server'
import { generateRustQr, generateRustRotatingToken, validateRustToken } from '@/lib/rust-qr'

export async function GET() {
  const rustUrl = process.env.NEXT_PUBLIC_RUST_QR_API_URL || 'https://rust-qr-api.onrender.com'
  let rustStatus = 'unreachable'

  try {
    const res = await fetch(`${rustUrl}/health`, { cache: 'no-store' })
    if (res.ok) {
      const data = await res.json()
      rustStatus = data.status || 'healthy'
    }
  } catch (e: any) {
    rustStatus = `error: ${e.message}`
  }

  return NextResponse.json({
    service: 'eventpass-nextjs-qr-bridge',
    engine: 'Rust (Render)',
    rust_api_url: rustUrl,
    rust_status: rustStatus,
    timestamp: new Date().toISOString(),
  })
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ error: 'Request body required' }, { status: 400 })
    }

    const { action, data, format, registration_id, event_id, token, interval_seconds } = body

    // 1. Generate QR Code
    if (action === 'generate' || (!action && data)) {
      const qrRes = await generateRustQr(data, format || 'svg')
      return NextResponse.json(qrRes)
    }

    // 2. Generate Dynamic Rotating Token
    if (action === 'token' && registration_id && event_id) {
      const tokenRes = await generateRustRotatingToken(registration_id, event_id, interval_seconds || 30)
      if (!tokenRes) {
        return NextResponse.json({ error: 'Failed to generate token from Rust engine' }, { status: 500 })
      }
      return NextResponse.json(tokenRes)
    }

    // 3. Validate Token
    if (action === 'validate' && token && registration_id && event_id) {
      const valRes = await validateRustToken(token, registration_id, event_id, interval_seconds || 30)
      return NextResponse.json(valRes)
    }

    return NextResponse.json({ error: 'Invalid action or missing required parameters' }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 })
  }
}
