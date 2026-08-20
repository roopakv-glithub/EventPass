const RUST_API_BASE_URL = process.env.NEXT_PUBLIC_RUST_QR_API_URL || 'https://rust-qr-api.onrender.com'

export interface RustQrGenerateResponse {
  success: boolean
  format: string
  data_url?: string
  svg?: string
  error?: string
}

export interface RustTokenResponse {
  success: boolean
  token: string
  token_hash: string
  expires_at: string
  ttl: number
  qr_data_url: string
}

export interface RustValidateResponse {
  valid: boolean
  status: string
  message: string
}

/**
 * Generate a QR code using the high-performance Rust microservice on Render
 */
export async function generateRustQr(data: string, format: 'svg' | 'png' = 'svg'): Promise<RustQrGenerateResponse> {
  try {
    const res = await fetch(`${RUST_API_BASE_URL}/api/qr/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data, format }),
      cache: 'no-store',
    })
    if (!res.ok) {
      throw new Error(`Rust API responded with status ${res.status}`)
    }
    return await res.json()
  } catch (err: any) {
    console.warn('Rust API QR generation warning:', err.message)
    return {
      success: false,
      format,
      error: err.message,
    }
  }
}

/**
 * Generate a rotating TOTP token using the Rust token engine
 */
export async function generateRustRotatingToken(
  registrationId: string,
  eventId: string,
  intervalSeconds: number = 30
): Promise<RustTokenResponse | null> {
  try {
    const res = await fetch(`${RUST_API_BASE_URL}/api/qr/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        registration_id: registrationId,
        event_id: eventId,
        interval_seconds: intervalSeconds,
      }),
      cache: 'no-store',
    })
    if (!res.ok) return null
    return await res.json()
  } catch (err) {
    console.warn('Rust API token generation failed:', err)
    return null
  }
}

/**
 * Validate a scanned token against the Rust validator
 */
export async function validateRustToken(
  token: string,
  registrationId: string,
  eventId: string,
  intervalSeconds: number = 30
): Promise<RustValidateResponse> {
  try {
    const res = await fetch(`${RUST_API_BASE_URL}/api/qr/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        registration_id: registrationId,
        event_id: eventId,
        interval_seconds: intervalSeconds,
      }),
    })
    if (!res.ok) {
      return { valid: false, status: 'error', message: `Server error: ${res.status}` }
    }
    return await res.json()
  } catch (err: any) {
    return { valid: false, status: 'network_error', message: err.message }
  }
}
