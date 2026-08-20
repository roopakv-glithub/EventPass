export type PendingCheckIn = {
  id: string
  token: string
  eventId: string
  queuedAt: string
}

const STORAGE_KEY = 'eventpass-pending-check-ins'

export function readPendingCheckIns(): PendingCheckIn[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as PendingCheckIn[]
  } catch {
    return []
  }
}

export function queueCheckIn(item: Omit<PendingCheckIn, 'id' | 'queuedAt'>) {
  const next = [...readPendingCheckIns(), { ...item, id: crypto.randomUUID(), queuedAt: new Date().toISOString() }]
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}

export function removePendingCheckIn(id: string) {
  const next = readPendingCheckIns().filter((item) => item.id !== id)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}

export async function syncPendingCheckIns() {
  const pending = readPendingCheckIns()
  const failed: PendingCheckIn[] = []
  for (const item of pending) {
    try {
      const response = await fetch('/api/check-ins', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: item.token, event_id: item.eventId }) })
      if (!response.ok && response.status !== 409) failed.push(item)
    } catch {
      failed.push(item)
    }
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(failed))
  return failed
}
