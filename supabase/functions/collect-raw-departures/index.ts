import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TRAFIKLAB_API_KEY = Deno.env.get('TRAFIKLAB_REALTIME_API_KEY') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const CORRIDOR_STOPS = [
  { id: '740000003', name: 'Malmö Centralstation' },
  { id: '740001554', name: 'Malmö Triangeln' },
  { id: '740001586', name: 'Malmö Hyllie' },
  { id: '860000626', name: 'København H' },
]

const formatDateTime = (date: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const fetchEndpoint = async (url: string): Promise<any[]> => {
  try {
    const response = await fetch(url)
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

const mapToRow = (dep: any, ingestedAt: string) => ({
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

    const [departures, arrivals] = await Promise.all([
      fetchEndpoint(departuresUrl),
      fetchEndpoint(arrivalsUrl),
    ])

    for (const dep of departures) allRows.push(mapToRow(dep, ingestedAt))
    for (const arr of arrivals) allRows.push(mapToRow(arr, ingestedAt))
  }

  if (allRows.length === 0) {
    return new Response(JSON.stringify({ success: true, rows: 0 }), { status: 200 })
  }

  const { error } = await supabase
    .from('raw_departures')
    .upsert(allRows, {
      onConflict: 'trip__trip_id,trip__start_date,stop__id,scheduled,ingested_at',
      ignoreDuplicates: true,
    })

  if (error) {
    console.error('Insert error:', error)
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500 })
  }

  console.log(`Inserted ${allRows.length} rows`)
  return new Response(JSON.stringify({ success: true, rows: allRows.length }), { status: 200 })
})