import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

const ORGANIZER_ID = 'OrganizerAcess'
const ORGANIZER_PASSWORD = 'Organizer123'
const SESSION_COOKIE = 'eventpass-session'
const SESSION_MAX_AGE = 60 * 60 * 8 // 8 hours

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key)
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const { action, organizer_id, password, regno } = body || {}

    // ── Organizer Login ──────────────────────────────────────
    if (action === 'organizer_login') {
      if (!organizer_id || !password) {
        return NextResponse.json({ error: 'Organizer ID and password required' }, { status: 400 })
      }

      // Validate fixed credentials
      if (organizer_id !== ORGANIZER_ID || password !== ORGANIZER_PASSWORD) {
        return NextResponse.json({ error: 'Invalid Organizer ID or password' }, { status: 401 })
      }

      // Build a session payload (JWT-like, signed by the secret)
      const sessionPayload = {
        id: 'organizer-fixed',
        role: 'organizer',
        organizer_id: ORGANIZER_ID,
        full_name: 'Organizer',
        email: 'organizer@eventpass.local',
        iat: Date.now(),
        exp: Date.now() + SESSION_MAX_AGE * 1000,
      }

      const cookieStore = await cookies()
      cookieStore.set(SESSION_COOKIE, JSON.stringify(sessionPayload), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: SESSION_MAX_AGE,
        path: '/',
      })

      return NextResponse.json({
        user: {
          id: 'organizer-fixed',
          role: 'organizer',
          full_name: 'Organizer',
          organizer_id: ORGANIZER_ID,
          name: 'Organizer',
          email: 'organizer@eventpass.local',
        },
      })
    }

    // ── Participant Login ────────────────────────────────────
    if (action === 'participant_login') {
      if (!regno || !password) {
        return NextResponse.json({ error: 'Register Number and password required' }, { status: 400 })
      }

      const supabase = getAdminClient()

      // Look up participant by regno
      const { data: profiles, error: lookupErr } = await supabase
        .from('profiles')
        .select('id, full_name, email, regno, role, password_hash')
        .eq('regno', regno)
        .limit(1)

      if (lookupErr || !profiles || profiles.length === 0) {
        return NextResponse.json({ error: 'Register Number not found' }, { status: 401 })
      }

      const profile = profiles[0]

      // Check password
      if (!profile.password_hash) {
        // First-time login: set the password
        const { error: updateErr } = await supabase
          .from('profiles')
          .update({ password_hash: password }) // store plain for now; upgrade to bcrypt if needed
          .eq('id', profile.id)
        if (updateErr) {
          return NextResponse.json({ error: 'Failed to set password' }, { status: 500 })
        }
      } else if (profile.password_hash !== password) {
        return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
      }

      const sessionPayload = {
        id: profile.id,
        role: 'participant',
        regno: profile.regno,
        full_name: profile.full_name,
        email: profile.email,
        iat: Date.now(),
        exp: Date.now() + SESSION_MAX_AGE * 1000,
      }

      const cookieStore = await cookies()
      cookieStore.set(SESSION_COOKIE, JSON.stringify(sessionPayload), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: SESSION_MAX_AGE,
        path: '/',
      })

      return NextResponse.json({
        user: {
          id: profile.id,
          role: 'participant',
          full_name: profile.full_name,
          name: profile.full_name,
          email: profile.email,
          regno: profile.regno,
        },
      })
    }

    // ── Get session ──────────────────────────────────────────
    if (action === 'get_session') {
      const cookieStore = await cookies()
      const raw = cookieStore.get(SESSION_COOKIE)?.value
      if (!raw) return NextResponse.json({ user: null })
      try {
        const session = JSON.parse(raw)
        if (session.exp < Date.now()) {
          cookieStore.delete(SESSION_COOKIE)
          return NextResponse.json({ user: null })
        }
        return NextResponse.json({ user: session })
      } catch {
        return NextResponse.json({ user: null })
      }
    }

    // ── Logout ───────────────────────────────────────────────
    if (action === 'logout') {
      const cookieStore = await cookies()
      cookieStore.delete(SESSION_COOKIE)
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Server error' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const cookieStore = await cookies()
    const raw = cookieStore.get(SESSION_COOKIE)?.value
    if (!raw) return NextResponse.json({ user: null })
    const session = JSON.parse(raw)
    if (session.exp < Date.now()) {
      cookieStore.delete(SESSION_COOKIE)
      return NextResponse.json({ user: null })
    }
    return NextResponse.json({ user: session })
  } catch {
    return NextResponse.json({ user: null })
  }
}
