import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

type Stats = { registered: number; checked_in: number; no_shows: number; capacity: number; peak_check_in_time: string | null }

function fallback(question: string, stats: Stats) {
  const remaining = Math.max(stats.capacity - stats.registered, 0)
  const rate = stats.registered ? Math.round((stats.no_shows / stats.registered) * 100) : 0
  if (/checked in/i.test(question)) return `${stats.checked_in} participants have checked in so far.`
  if (/no.?show/i.test(question)) return `${rate}% of registered attendees are no-shows (${stats.no_shows} people).`
  if (/peak|busiest/i.test(question)) return stats.peak_check_in_time ? `Check-ins peaked around ${new Date(stats.peak_check_in_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.` : 'There is not enough check-in activity to identify a peak yet.'
  if (/spot|capacity|left/i.test(question)) return `${remaining} spots are left.`
  return `There are ${stats.registered} registered, ${stats.checked_in} checked in, and ${stats.no_shows} no-shows.`
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  const body = await request.json().catch(() => null)
  if (!body?.event_id || !body?.question) return NextResponse.json({ error: 'event_id and question are required' }, { status: 400 })

  const { data: event } = await supabase.from('events').select('id,name,organizer_id').eq('id', body.event_id).single()
  if (!event || event.organizer_id !== user.id) return NextResponse.json({ error: 'Organizer access required' }, { status: 403 })
  const { data: stats, error } = await supabase.rpc('event_stats', { target_event_id: body.event_id })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const answer = fallback(body.question, stats as Stats)
  const apiKey = process.env.GITHUB_TOKEN
  if (!apiKey) return NextResponse.json({ answer, source: 'database-fallback', stats })

  const aiResponse = await fetch(process.env.GITHUB_MODELS_API_URL ?? 'https://models.github.ai/inference/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
      temperature: 0,
      messages: [
        { role: 'system', content: 'Answer only from the supplied JSON. If the answer is not present, say that the data is unavailable. Never invent statistics.' },
        { role: 'user', content: JSON.stringify({ event: event.name, stats, question: body.question }) },
      ],
    }),
  }).catch(() => null)
  if (!aiResponse?.ok) return NextResponse.json({ answer, source: 'database-fallback', stats })
  const payload = await aiResponse.json()
  return NextResponse.json({ answer: payload.choices?.[0]?.message?.content ?? answer, source: 'ai', stats })
}
