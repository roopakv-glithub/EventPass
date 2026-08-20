import { strict as assert } from 'node:assert'

const baseUrl = process.env.TEST_BASE_URL ?? 'http://localhost:3000'
const eventId = process.env.TEST_EVENT_ID
const token = process.env.TEST_QR_TOKEN
const capacity = Number(process.env.TEST_CAPACITY ?? 50)
const count = Number(process.env.TEST_REQUESTS ?? 100)

if (!eventId) throw new Error('Set TEST_EVENT_ID to a published event UUID')
if (!token) throw new Error('Set TEST_QR_TOKEN to a real opaque QR token for check-in testing')

async function post(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.TEST_AUTH_TOKEN ?? ''}` },
    body: JSON.stringify(body),
  })
  return { status: response.status, body: await response.json().catch(() => ({})) }
}

const checkInResults = await Promise.all(Array.from({ length: count }, () => post('/api/check-ins', { event_id: eventId, token })))
const checkInSuccesses = checkInResults.filter((result) => result.body.status === 'checked_in')
const duplicateResponses = checkInResults.filter((result) => result.body.status === 'already_checked_in')
assert.equal(checkInSuccesses.length, 1, `expected one check-in success, got ${checkInSuccesses.length}`)
assert.equal(checkInSuccesses.length + duplicateResponses.length, count, 'every concurrent check-in must have a deterministic result')
console.log(JSON.stringify({ checkInRequests: count, successes: checkInSuccesses.length, alreadyCheckedIn: duplicateResponses.length }))

console.log(`Registration capacity proof requires ${count} authenticated participant tokens, one per request.`)
console.log(`Run the same POST /api/registrations request concurrently with TEST_CAPACITY=${capacity}; expected successes=${capacity}, full responses=${count - capacity}.`)
