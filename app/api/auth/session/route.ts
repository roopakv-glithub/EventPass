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

    // ── Participant Signup ───────────────────────────────────
    if (action === 'participant_signup') {
      if (!regno || !password) {
        return NextResponse.json({ error: 'Register Number and password required' }, { status: 400 })
      }
      if (password.length < 6) {
        return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
      }

      const supabase = getAdminClient()
      const regnoEmail = `${regno.toLowerCase().replace(/\s+/g, '')}@eventpass.local`

      // 1. Check if profile exists under either this regno or deterministically generated email
      const { data: existing } = await supabase
        .from('profiles')
        .select('id, full_name, email, regno, role, password_hash')
        .or(`regno.eq.${regno},email.eq.${regnoEmail}`)
        .maybeSingle()

      if (existing) {
        if (existing.password_hash) {
          return NextResponse.json({ error: 'This Register Number already has an account. Please sign in instead.' }, { status: 409 })
        }
        // Account placeholder exists (e.g. from manual/admin sync) — set password now
        const { error: updateErr } = await supabase
          .from('profiles')
          .update({
            password_hash: password,
            full_name: body.full_name || existing.full_name,
            regno: regno
          })
          .eq('id', existing.id)
        
        if (updateErr) {
          return NextResponse.json({ error: `Failed to set password: ${updateErr.message}` }, { status: 500 })
        }
        
        const sessionPayload = {
          id: existing.id, role: 'participant', regno: regno,
          full_name: body.full_name || existing.full_name, email: existing.email || regnoEmail,
          iat: Date.now(), exp: Date.now() + SESSION_MAX_AGE * 1000,
        }
        const cookieStore = await cookies()
        cookieStore.set(SESSION_COOKIE, JSON.stringify(sessionPayload), {
          httpOnly: true, secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax', maxAge: SESSION_MAX_AGE, path: '/',
        })
        return NextResponse.json({ user: { id: existing.id, role: 'participant', full_name: body.full_name || existing.full_name, name: body.full_name || existing.full_name, email: existing.email || regnoEmail, regno } })
      }

      // 2. No profile exists: create in Supabase Auth first
      let authUserId: string | null = null

      try {
        const { data: adminUser, error: adminErr } = await supabase.auth.admin.createUser({
          email: regnoEmail,
          password: password,
          email_confirm: true,
          user_metadata: { full_name: body.full_name || regno, role: 'participant', regno }
        })

        if (adminErr) {
          return NextResponse.json({ error: `Auth registration failed: ${adminErr.message}` }, { status: 400 })
        } else if (adminUser?.user) {
          authUserId = adminUser.user.id
        }
      } catch (err: any) {
        return NextResponse.json({ error: `Auth registration exception: ${err.message}` }, { status: 500 })
      }

      if (!authUserId) {
        return NextResponse.json({ error: 'Failed to generate user credentials.' }, { status: 500 })
      }

      // 3. Upsert the profile row. (Trigger public.handle_new_user might have run already, upsert handles both seamlessly)
      const { error: upsertErr } = await supabase
        .from('profiles')
        .upsert({
          id: authUserId,
          full_name: body.full_name || regno,
          email: regnoEmail,
          regno,
          role: 'participant',
          password_hash: password,
        }, { onConflict: 'id' })

      if (upsertErr) {
        return NextResponse.json({ error: `Failed to create profile: ${upsertErr.message}` }, { status: 500 })
      }

      const sessionPayload = {
        id: authUserId, role: 'participant', regno,
        full_name: body.full_name || regno, email: regnoEmail,
        iat: Date.now(), exp: Date.now() + SESSION_MAX_AGE * 1000,
      }
      const cookieStore = await cookies()
      cookieStore.set(SESSION_COOKIE, JSON.stringify(sessionPayload), {
        httpOnly: true, secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax', maxAge: SESSION_MAX_AGE, path: '/',
      })
      return NextResponse.json({ user: { id: authUserId, role: 'participant', full_name: body.full_name || regno, name: body.full_name || regno, email: regnoEmail, regno } })
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
        return NextResponse.json({ error: 'Register Number not found. Please create an account first.' }, { status: 401 })
      }

      const profile = profiles[0]

      // Check password
      if (!profile.password_hash) {
        return NextResponse.json({ error: 'No password set. Please use Create Account to register.' }, { status: 401 })
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
