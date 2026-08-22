import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  return createClient(url, key)
}

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || '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'
const NVIDIA_MODEL = 'nvidia/nemotron-3.5-lightning-30b-a3b'

type Stats = {
  registered: number
  checked_in: number
  no_shows: number
  capacity: number
  peak_check_in_time: string | null
}

function fallback(question: string, stats: Stats, eventName: string) {
  const remaining = Math.max(stats.capacity - stats.registered, 0)
  const rate = stats.registered ? Math.round((stats.no_shows / stats.registered) * 100) : 0
  const checkInRate = stats.registered ? Math.round((stats.checked_in / stats.registered) * 100) : 0

  if (/checked in/i.test(question)) return `${stats.checked_in} out of ${stats.registered} registered participants have checked in so far (${checkInRate}% check-in rate).`
  if (/no.?show/i.test(question)) return `${rate}% of registered attendees are no-shows (${stats.no_shows} people out of ${stats.registered} registered).`
  if (/peak|busiest/i.test(question)) return stats.peak_check_in_time ? `Check-ins for ${eventName} peaked around ${new Date(stats.peak_check_in_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.` : `There is not enough check-in activity for ${eventName} to identify a peak time yet.`
  if (/spot|capacity|left/i.test(question)) return `There are ${remaining} spots left out of total capacity ${stats.capacity}.`
  return `${eventName} Summary: ${stats.registered} registered, ${stats.checked_in} checked in (${checkInRate}%), ${stats.no_shows} no-shows, and ${remaining} remaining capacity.`
}

export async function POST(request: Request) {
  try {
    const supabase = getAdminClient()
    const body = await request.json().catch(() => null)
    if (!body?.event_id || !body?.question) {
      return NextResponse.json({ error: 'event_id and question are required' }, { status: 400 })
    }

    // 1. Fetch live event info
    const { data: event } = await supabase
      .from('events')
      .select('id, name, capacity')
      .eq('id', body.event_id)
      .maybeSingle()

    const eventName = event?.name ?? 'Event'
    const capacity = event?.capacity ?? 100

    // 2. Fetch live counts from Supabase
    const [{ count: regCount }, { count: checkInCount }] = await Promise.all([
      supabase.from('registrations').select('*', { count: 'exact', head: true }).eq('event_id', body.event_id).eq('status', 'registered'),
      supabase.from('check_ins').select('*', { count: 'exact', head: true }).eq('event_id', body.event_id),
    ])

    const registered = regCount ?? 0
    const checked_in = checkInCount ?? 0
    const no_shows = Math.max(registered - checked_in, 0)
    const stats: Stats = {
      registered,
      checked_in,
      no_shows,
      capacity,
      peak_check_in_time: null,
    }

    // 3. Query NVIDIA Nemotron AI Model
    try {
      const aiResponse = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${NVIDIA_API_KEY}`,
        },
        body: JSON.stringify({
          model: NVIDIA_MODEL,
          messages: [
            {
              role: 'system',
              content: 'You are an AI Analytics Assistant for EventPass. Answer the user question accurately based on the supplied event JSON statistics. Do not hallucinate or invent numbers not present in the data. Keep responses professional, clear, and concise.'
            },
            {
              role: 'user',
              content: `Live Event Data:\n${JSON.stringify({
                event_name: eventName,
                capacity,
                registered_attendees: registered,
                checked_in_attendees: checked_in,
                no_shows,
                check_in_percentage: registered ? `${Math.round((checked_in / registered) * 100)}%` : '0%',
                available_capacity: Math.max(capacity - registered, 0)
              }, null, 2)}\n\nQuestion: ${body.question}`
            }
          ],
          temperature: 0.2,
          max_tokens: 1024,
        }),
      })

      if (aiResponse.ok) {
        const payload = await aiResponse.json()
        const aiAnswer = payload.choices?.[0]?.message?.content
        if (aiAnswer) {
          return NextResponse.json({ answer: aiAnswer, source: 'nvidia-nemotron-3.5', stats })
        }
      }
    } catch (aiErr) {
      console.error('NVIDIA AI API Error:', aiErr)
    }

    // 4. Database fallback answer if AI service unreachable
    const answer = fallback(body.question, stats, eventName)
    return NextResponse.json({ answer, source: 'database-fallback', stats })
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Server error' }, { status: 500 })
  }
}
