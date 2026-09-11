import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TRAFIKLAB_API_KEY = Deno.env.get('TRAFIKLAB_REALTIME_API_KEY') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const CORRIDOR_STOPS = [
  { id: '740000003', name: 'Malmö Centralstation' },
  { id: '740001587', name: 'Malmö Triangeln' },
  { id: '740001586', name: 'Malmö Hyllie' },
  { id: '860000626', name: 'København H' },
  { id: '860000856', name: 'København Ørestad' },
  { id: '860000857', name: 'Tårnby' },
  { id: '860050858', name: 'CPH Airport' },
  { id: '860000646', name: 'København Nørreport' },
  { id: '860000650', name: 'Østerport' },
]

const REQUEST_SPACING_MS = 250
const MAX_RETRIES = 3
const DEFAULT_RETRY_AFTER_S = 2

// Upsert in chunks, each retried independently. Mirrors the TV collector's v21
// CHUNK_SIZE batching, for the same reason: one big upsert is all-or-nothing,
// so a single transient PostgREST "Gateway Timeout" loses the whole poll. That
// is exactly what happened 2026-09-12 00:00 (Europe/Stockholm) — the insert
// failed, nothing committed, and because this collector runs HOURLY against a
// 90-min rest_raw freshness threshold, one lost poll breaches the watchdog.
const UPSERT_CHUNK_SIZE = 200
const UPSERT_ATTEMPTS = 3
const UPSERT_BACKOFF_MS = 1000

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const formatDateTime = (date: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const fetchWithRetry = async (url: string, attempt = 0): Promise<any[]> => {
  try {
    const response = await fetch(url)

    if (response.status === 429) {
      if (attempt >= MAX_RETRIES) {
        console.error(`Gave up on ${url} after ${MAX_RETRIES} retries (429)`)
        return []
      }
      const retryAfterHeader = response.headers.get('retry-after')
      const retryAfterS = Number(retryAfterHeader) || DEFAULT_RETRY_AFTER_S * Math.pow(2, attempt)
      console.warn(`429 on ${url}, sleeping ${retryAfterS}s (attempt ${attempt + 1})`)
      await sleep(retryAfterS * 1000)
      return fetchWithRetry(url, attempt + 1)
    }

    if (!response.ok) {
      console.error(`API error for ${url}: ${response.status}`)
      return []
    }

    const data = await response.json()
    return data.departures ?? data.arrivals ?? []
  } catch (error) {
    console.error(`Fetch failed for ${url}:`, error)
    return []
  }
}

const mapToRow = (dep: any, ingestedAt: string, eventType: 'arrival' | 'departure') => ({
  scheduled: dep.scheduled,
  realtime: dep.realtime,
  arrival_delay: dep.delay,
  canceled: dep.canceled,
  is_realtime: dep.is_realtime,
  route__name: dep.route?.name,
  route__designation: dep.route?.designation,
  route__transport_mode_code: dep.route?.transport_mode_code,
  route__transport_mode: dep.route?.transport_mode,
  route__direction: dep.route?.direction,
  route__origin__id: dep.route?.origin?.id,
  route__origin__name: dep.route?.origin?.name,
  route__destination__id: dep.route?.destination?.id,
  route__destination__name: dep.route?.destination?.name,
  trip__trip_id: dep.trip?.trip_id,
  trip__start_date: dep.trip?.start_date,
  trip__technical_number: dep.trip?.technical_number,
  agency__id: dep.agency?.id,
  agency__name: dep.agency?.name,
  agency__operator: dep.agency?.operator,
  stop__id: dep.stop?.id,
  stop__name: dep.stop?.name,
  stop__lat: dep.stop?.lat,
  stop__lon: dep.stop?.lon,
  scheduled_platform__id: dep.scheduled_platform?.id,
  scheduled_platform__designation: dep.scheduled_platform?.designation,
  realtime_platform__id: dep.realtime_platform?.id,
  realtime_platform__designation: dep.realtime_platform?.designation,
  alerts: dep.alerts,
  event_type: eventType,
  ingested_at: ingestedAt,
})

Deno.serve(async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const now = new Date()
  const datetime = formatDateTime(now)
  const ingestedAt = now.toISOString()
  const allRows: any[] = []

  for (const stop of CORRIDOR_STOPS) {
    const departuresUrl = `https://realtime-api.trafiklab.se/v1/departures/${stop.id}/${datetime}?key=${TRAFIKLAB_API_KEY}`
    const arrivalsUrl = `https://realtime-api.trafiklab.se/v1/arrivals/${stop.id}/${datetime}?key=${TRAFIKLAB_API_KEY}`

    const departures = await fetchWithRetry(departuresUrl)
    await sleep(REQUEST_SPACING_MS)

    const arrivals = await fetchWithRetry(arrivalsUrl)
    await sleep(REQUEST_SPACING_MS)

    for (const dep of departures) allRows.push(mapToRow(dep, ingestedAt, 'departure'))
    for (const arr of arrivals) allRows.push(mapToRow(arr, ingestedAt, 'arrival'))
  }

  if (allRows.length === 0) {
    return new Response(JSON.stringify({ success: true, rows: 0 }), { status: 200 })
  }

  // onConflict MUST match the unique constraint on raw_departures:
  // (trip__trip_id, trip__start_date, stop__id, scheduled, ingested_at, event_type).
  // event_type is included so that arrival + departure rows for the same trip
  // at the same intermediate stop (e.g. Malmö Triangeln pass-through) both
  // survive the upsert. Prior to 2026-05-26 the constraint omitted event_type,
  // which caused arrival rows to be silently dropped whenever Trafiklab
  // returned identical `scheduled` values for both endpoints.
  const chunkErrors: string[] = []
  let inserted = 0

  for (let start = 0; start < allRows.length; start += UPSERT_CHUNK_SIZE) {
    const chunk = allRows.slice(start, start + UPSERT_CHUNK_SIZE)
    const chunkNo = start / UPSERT_CHUNK_SIZE
    let lastError: string | null = null

    for (let attempt = 0; attempt < UPSERT_ATTEMPTS; attempt++) {
      if (attempt > 0) await sleep(UPSERT_BACKOFF_MS * Math.pow(2, attempt - 1))

      const { error } = await supabase
        .from('raw_departures')
        .upsert(chunk, {
          onConflict: 'trip__trip_id,trip__start_date,stop__id,scheduled,ingested_at,event_type',
          ignoreDuplicates: true,
        })

      if (!error) {
        lastError = null
        break
      }

      lastError = error.message
      console.warn(`chunk ${chunkNo} upsert failed (attempt ${attempt + 1}): ${error.message}`)
    }

    if (lastError) {
      chunkErrors.push(`chunk ${chunkNo}: ${lastError}`)
    } else {
      inserted += chunk.length
    }
  }

  // A partial commit is reported honestly but still counts as progress: the
  // rows that landed are real, and `ingested_at` freshness is what the §10
  // watchdog measures. Only a total loss is a 500 — otherwise a single bad
  // chunk would hide the fact that the rest of the poll succeeded.
  if (chunkErrors.length > 0) {
    console.error('Insert errors:', chunkErrors)
    if (inserted === 0) {
      return new Response(
        JSON.stringify({ success: false, rows: 0, chunk_errors: chunkErrors }),
        { status: 500 },
      )
    }
  }

  console.log(`Inserted ${inserted} of ${allRows.length} rows`)
  return new Response(
    JSON.stringify({
      success: chunkErrors.length === 0,
      rows: inserted,
      attempted: allRows.length,
      chunk_errors: chunkErrors,
    }),
    { status: 200 },
  )
})
