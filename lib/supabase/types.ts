export type Role = 'participant' | 'organizer'

export type EventStatus = 'draft' | 'published' | 'cancelled' | 'completed'

export type Registration = {
  id: string
  participant_id: string
  event_id: string
  status: 'registered' | 'cancelled'
  qr_payload: string | null
  qr_status: 'pending' | 'active' | 'used' | 'expired'
  qr_created_at: string | null
  qr_expires_at: string | null
  registered_at: string
}

export type EventRecord = {
  id: string
  organizer_id: string
  name: string
  event_date: string
  start_time: string
  end_time: string | null
  capacity: number
  description: string
  location: string
  image_url: string | null
  status: EventStatus
}
