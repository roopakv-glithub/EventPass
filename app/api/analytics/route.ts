import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  return createClient(url, key)
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const eventId = searchParams.get('event_id')

    const supabase = getAdminClient()

    // If no event_id, return stats for all events
    if (!eventId || eventId === 'all') {
      const { data: events, error: eventsErr } = await supabase
        .from('events')
        .select('id, name, capacity')
        .order('event_date', { ascending: true })

      if (eventsErr) {
        return NextResponse.json({ error: eventsErr.message }, { status: 500 })
      }

      // For each event, get registered + checked_in counts
      const statsPromises = (events ?? []).map(async (ev) => {
        const [{ count: registered }, { count: checkedIn }] = await Promise.all([
          supabase
            .from('registrations')
            .select('*', { count: 'exact', head: true })
            .eq('event_id', ev.id)
            .eq('status', 'registered'),
          supabase
            .from('check_ins')
            .select('*', { count: 'exact', head: true })
            .eq('event_id', ev.id),
        ])

        return {
          event_id: ev.id,
          event_name: ev.name,
          capacity: ev.capacity,
          registered: registered ?? 0,
          checked_in: checkedIn ?? 0,
        }
      })

      const allStats = await Promise.all(statsPromises)
      return NextResponse.json({ events: allStats })
    }

    // Single event analytics using RPC
    const { data: rpcData, error: rpcErr } = await supabase.rpc('get_event_analytics', {
      target_event_id: eventId,
    })

    if (!rpcErr && rpcData) {
      // Shape hourly data into chart format
      const hourly: Array<{ hour: string; count: number }> = rpcData.hourly ?? []
      const labels = hourly.map((h) => h.hour)
      const checkIns = hourly.map((h) => h.count)

      return NextResponse.json({
        event_id: rpcData.event_id,
        event_name: rpcData.event_name,
        registered: Number(rpcData.registered),
        checked_in: Number(rpcData.checked_in),
        labels,
        checkIns,
      })
    }

    // Fallback: manual query if RPC not yet available
    const [
      { count: registered },
      { count: checkedIn },
      { data: hourlyRaw },
      { data: eventInfo },
    ] = await Promise.all([
      supabase
        .from('registrations')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', eventId)
        .eq('status', 'registered'),
      supabase
        .from('check_ins')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', eventId),
      supabase
        .from('check_ins')
        .select('checked_in_at')
        .eq('event_id', eventId)
        .order('checked_in_at', { ascending: true }),
      supabase
        .from('events')
        .select('id, name')
        .eq('id', eventId)
        .maybeSingle(),
    ])

    // Build hourly buckets manually
    const buckets: Record<string, number> = {}
    ;(hourlyRaw ?? []).forEach((row: any) => {
      const d = new Date(row.checked_in_at)
      const hour = `${String(d.getHours()).padStart(2, '0')}:00`
      buckets[hour] = (buckets[hour] ?? 0) + 1
    })

    const sortedHours = Object.keys(buckets).sort()
    const labels = sortedHours
    const checkIns = sortedHours.map((h) => buckets[h])

    return NextResponse.json({
      event_id: eventId,
      event_name: eventInfo?.name ?? 'Event',
      registered: registered ?? 0,
      checked_in: checkedIn ?? 0,
      labels,
      checkIns,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Server error' }, { status: 500 })
  }
}
