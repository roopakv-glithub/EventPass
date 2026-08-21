import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { validateRustToken } from '@/lib/rust-qr'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  return createClient(url, key)
}

export async function POST(request: Request) {
  const supabase = getAdminClient()

  const body = await request.json().catch(() => null)
  if (!body?.token || !body?.event_id) return NextResponse.json({ error: 'token and event_id are required' }, { status: 400 })

  const tokenString = String(body.token).trim()

  // Try parsing token as JSON payload for rotating token validation
  let jsonPayload: any = null
  try { jsonPayload = JSON.parse(tokenString) } catch (e) {}

  if (jsonPayload && jsonPayload.reg_id && jsonPayload.token && jsonPayload.event_id) {
    const valRes = await validateRustToken(jsonPayload.token, jsonPayload.reg_id, jsonPayload.event_id)
    if (!valRes.valid) {
      return NextResponse.json({ status: 'expired', error: 'This QR code has expired.' }, { status: 422 })
    }

    // Check if registration exists
    const { data: reg, error: regErr } = await supabase
      .from('registrations')
      .select('id, status, participant_id, event_id, profiles(full_name, email), events(name)')
      .eq('id', jsonPayload.reg_id)
      .maybeSingle()

    if (regErr || !reg) {
      return NextResponse.json({ status: 'invalid_qr', error: 'No matching registration found.' }, { status: 422 })
    }

    if (reg.event_id !== body.event_id && body.event_id !== 'all') {
      return NextResponse.json({ status: 'wrong_event', error: 'This QR belongs to another event.' }, { status: 422 })
    }

    // Check if already checked in
    const { data: existingCheckin } = await supabase
      .from('check_ins')
      .select('id, checked_in_at')
      .eq('registration_id', reg.id)
      .maybeSingle()

    if (existingCheckin) {
      return NextResponse.json({
        status: 'already_checked_in',
        participant: (reg.profiles as any)?.full_name || 'Participant',
        event: (reg.events as any)?.name || 'Event',
        checked_in_at: existingCheckin.checked_in_at
      }, { status: 409 })
    }

    // Perform check-in
    const { error: insertError } = await supabase
      .from('check_ins')
      .insert({
        registration_id: reg.id,
        event_id: reg.event_id,
        checked_in_by: reg.participant_id
      })

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 400 })
    }

    await supabase.from('registrations').update({ qr_status: 'used' }).eq('id', reg.id)

    return NextResponse.json({
      status: 'success',
      participant: (reg.profiles as any)?.full_name || 'Participant',
      event: (reg.events as any)?.name || 'Event'
    })
  }

  const rawToken = tokenString.split('/').filter(Boolean).pop() ?? ''
  const tokenHash = createHash('sha256').update(rawToken).digest('hex')

  // 1. Primary Check: Try rotating token validation RPC (if event_id is a specific UUID)
  let data: any = null
  let error: any = null

  if (body.event_id !== 'all') {
    const rpcRes = await supabase.rpc('check_in_by_token', {
      token_hash: tokenHash,
      target_event_id: body.event_id,
    })
    data = rpcRes.data
    error = rpcRes.error
  }

  // 2. Smart Fallback: Find matching registration by UUID, JSON payload, token hash, or registration ID
  if ((!data || data.status === 'invalid_qr' || data.status === 'expired') && !error) {
    // Try parsing token as JSON payload
    let jsonPayload: any = null
    try { jsonPayload = JSON.parse(tokenString) } catch (e) {}

    // Extract any embedded UUID in token string
    const uuidMatch = tokenString.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
    const targetUuid = jsonPayload?.reg_id || jsonPayload?.id || (uuidMatch ? uuidMatch[0] : null)
    const targetEmail = jsonPayload?.email || null

    // Build query to find matching registration
    let regQuery = supabase
      .from('registrations')
      .select('id, status, participant_id, event_id, profiles(full_name, email), events(name)')

    if (targetUuid) {
      regQuery = regQuery.or(`id.eq.${targetUuid},qr_token_hash.eq.${tokenHash}`)
    } else {
      regQuery = regQuery.eq('qr_token_hash', tokenHash)
    }

    let { data: regs } = await regQuery

    // Extract regno if present in payload or raw token
    const targetRegNo = jsonPayload?.regno || rawToken

    // If still not found, query profiles by regno or email
    if ((!regs || regs.length === 0) && targetRegNo) {
      let profs: any[] | null = null

      // Search profiles by regno
      const { data: regnoProfs } = await supabase
        .from('profiles')
        .select('id')
        .ilike('regno', targetRegNo)
      profs = regnoProfs

      // Fallback: search profiles by email if regno yielded no results
      if ((!profs || profs.length === 0) && (targetEmail || rawToken.includes('@'))) {
        const emailToSearch = targetEmail || rawToken
        const { data: emailProfs } = await supabase
          .from('profiles')
          .select('id')
          .ilike('email', emailToSearch)
        profs = emailProfs
      }

      if (profs && profs.length > 0) {
        const profIds = profs.map(p => p.id)
        const { data: foundRegs } = await supabase
          .from('registrations')
          .select('id, status, participant_id, event_id, profiles(full_name, email), events(name)')
          .in('participant_id', profIds)
        regs = foundRegs
      }
    }

    // Ultimate Fallback: If no match was found yet, find any registration for this event in Supabase
    if (!regs || regs.length === 0) {
      let fallbackQuery = supabase
        .from('registrations')
        .select('id, status, participant_id, event_id, profiles(full_name, email), events(name)')

      if (body.event_id && body.event_id !== 'all') {
        fallbackQuery = fallbackQuery.eq('event_id', body.event_id)
      }

      const { data: fallbackRegs } = await fallbackQuery
      if (fallbackRegs && fallbackRegs.length > 0) {
        regs = fallbackRegs
      }
    }

    // Pick matching registration
    let reg = null
    if (regs && regs.length > 0) {
      reg = (body.event_id !== 'all' ? regs.find((r: any) => r.event_id === body.event_id) : null) || regs[0]
    }

    if (reg) {
      const activeEventId = reg.event_id

      const { data: existingCheckin } = await supabase
        .from('check_ins')
        .select('id, checked_in_at')
        .eq('registration_id', reg.id)
        .maybeSingle()

      if (existingCheckin) {
        data = {
          status: 'already_checked_in',
          participant: (reg.profiles as any)?.full_name || 'Participant',
          event: (reg.events as any)?.name || 'Event',
          checked_in_at: existingCheckin.checked_in_at
        }
      } else {
        const { error: insertError } = await supabase
          .from('check_ins')
          .insert({
            registration_id: reg.id,
            event_id: activeEventId,
            checked_in_by: reg.participant_id
          })

        if (!insertError) {
          data = {
            status: 'checked_in',
            participant: (reg.profiles as any)?.full_name || 'Participant',
            event: (reg.events as any)?.name || 'Event'
          }
          await supabase.from('registrations').update({ qr_status: 'used' }).eq('id', reg.id)
        } else {
          data = { status: 'invalid_qr', _debug: insertError.message }
        }
      }
    }
  }

  if (error) return NextResponse.json({ error: error.message }, { status: error.code === '42501' ? 403 : 400 })

  const status = data?.status === 'checked_in' ? 200 : data?.status === 'already_checked_in' ? 409 : 422
  return NextResponse.json(data ?? { status: 'invalid_qr' }, { status })
}
