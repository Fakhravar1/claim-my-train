import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { ROUTES, Direction, STOPS, STOP_OPTIONS } from '../shared/stops.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RealtimePlatform {
  designation?: string;
}

interface RealtimeRoute {
  name?: string;
  designation?: string;
  direction?: string;
  origin?: { name?: string };
  destination?: { name?: string };
  transport_mode?: string;
}

interface RealtimeDeparture {
  scheduled: string;
  realtime: string;
  delay: number;
  canceled: boolean;
  is_realtime: boolean;
  route: RealtimeRoute;
  trip?: {
    trip_id?: string;
    start_date?: string;
    technical_number?: number;
  };
  agency?: { name?: string };
  stop?: { name?: string };
  scheduled_platform?: RealtimePlatform | null;
  realtime_platform?: RealtimePlatform | null;
}

interface RealtimeResponse {
  departures?: RealtimeDeparture[];
  arrivals?: RealtimeDeparture[];
}

interface EdgePayload {
  direction: Direction;
  updatedAt: string;
  departures: unknown[];
}
interface CorridorWindowRow {
  event_key: string;
  direction: string;
  trip_key: string;
  line: string;
  line_name: string;
  origin_stop_id: string;
  origin_stop_name: string;
  destination_stop_id: string;
  destination_stop_name: string;
  departure_datetime: string;
  scheduled_arrival_datetime: string | null;
  actual_arrival_datetime: string | null;
  arrival_delay_minutes: number;
  claimable: boolean;
}

const formatDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatTime = (date: Date) => {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
};

const normalizeText = (value: string) =>
  value
    .replace(/ø/g, "o")
    .replace(/Ø/g, "O")
    .replace(/æ/g, "ae")
    .replace(/Æ/g, "Ae")
    .replace(/å/g, "a")
    .replace(/Å/g, "A")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

const formatDateTime = (date: Date) => `${formatDate(date)}T${formatTime(date)}`;

const isoDate = (iso: string) => iso.split('T')[0] ?? '';
const isoTime = (iso: string) => iso.split('T')[1]?.slice(0, 8) ?? '';
const timeToSeconds = (time: string | null) => {
  if (!time) return null;
  const [h, m, s = "0"] = time.split(":");
  const hh = Number(h);
  const mm = Number(m);
  const ss = Number(s);
  if ([hh, mm, ss].some((v) => Number.isNaN(v))) return null;
  return hh * 3600 + mm * 60 + ss;
};

const COPENHAGEN_CORRIDOR_LINES = new Set(["802", "803", "804", "805", "806"]);
const RESPONSE_CACHE_TTL_MS = 45_000;
const STALE_CACHE_MAX_AGE_MS = 10 * 60_000;
const DELAY_ALERT_MINUTES = 20;
const MATCH_RATE_FOR_SECONDARY_WINDOW = 0.7;
const responseCache = new Map<string, { storedAt: number; payload: EdgePayload }>();
const getCachedPayload = (cacheKey: string, maxAgeMs: number): EdgePayload | null => {
  const entry = responseCache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() - entry.storedAt > maxAgeMs) return null;
  return entry.payload;
};

const tripKey = (dep: RealtimeDeparture) => {
  const tripId = String(dep.trip?.trip_id ?? "").trim();
  const startDate = String(dep.trip?.start_date ?? "").trim();
  if (tripId && startDate) return `${tripId}|${startDate}`;

  const technical = String(dep.trip?.technical_number ?? "").trim();
  if (technical && startDate) return `tech:${technical}|${startDate}`;
  return "";
};
const departureKey = (dep: RealtimeDeparture) =>
  tripKey(dep) ||
  [
    dep.route?.designation ?? "",
    dep.scheduled ?? "",
    dep.realtime ?? "",
    dep.route?.direction ?? "",
    dep.route?.origin?.name ?? "",
    dep.route?.destination?.name ?? "",
  ].join("|");

const isCopenhagen = (text: string) => {
  const t = normalizeText(text);
  return (
    t.includes('kobenhavn') ||
    t.includes('kopenhamn') ||
    t.includes('copenhagen') ||
    t.includes('osterport') ||
    // Handle mojibake variants like "KÃ¸benhavn Ã˜sterport"
    t.includes('sterport') ||
    t.includes('benhavn')
  );
};
const isMalmo = (text: string) => {
  const t = normalizeText(text);
  return t.includes('malmo') || t.includes('malm');
};

const stopById = (id: string) => Object.values(STOPS).find((stop) => stop.id === id);
const stopSequence = STOP_OPTIONS.map((stop) => stop.id);
const corridorPairsForDirection = (direction: Direction) => {
  const pairs: Array<{ originId: string; destinationId: string }> = [];
  for (let i = 0; i < stopSequence.length; i += 1) {
    for (let j = 0; j < stopSequence.length; j += 1) {
      if (i === j) continue;
      if (direction === "malmo-departures" && i < j) {
        pairs.push({ originId: stopSequence[i], destinationId: stopSequence[j] });
      }
      if (direction === "hyllie-departures" && i > j) {
        pairs.push({ originId: stopSequence[i], destinationId: stopSequence[j] });
      }
    }
  }
  return pairs;
};

const toUiDeparture = (row: CorridorWindowRow) => {
  const depDate = isoDate(row.departure_datetime);
  const depTime = isoTime(row.departure_datetime);
  const actualArrDate = row.actual_arrival_datetime ? isoDate(row.actual_arrival_datetime) : null;
  const actualArrTime = row.actual_arrival_datetime ? isoTime(row.actual_arrival_datetime) : null;
  const scheduledArrTime = row.scheduled_arrival_datetime ? isoTime(row.scheduled_arrival_datetime) : null;
  return {
    line: row.line,
    operator: "Corridor collector",
    lineName: row.line_name,
    transportCategory: "TRAIN",
    departureStationId: row.origin_stop_id,
    departureStation: row.origin_stop_name,
    arrivalStation: row.destination_stop_name,
    departureTime: depTime,
    departureDate: depDate,
    scheduledTime: depTime,
    arrivalTime: actualArrTime,
    arrivalDate: actualArrDate,
    scheduledArrivalTime: scheduledArrTime,
    isArrivalDelayed: row.arrival_delay_minutes > 0,
    isArrivalEarly: row.arrival_delay_minutes < 0,
    arrivalDelayMinutes: row.arrival_delay_minutes,
    track: undefined,
    isDelayed: row.arrival_delay_minutes > 0,
    delayMinutes: Math.max(0, row.arrival_delay_minutes),
  };
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let cacheKey = "";

  try {
    const { direction, originId, destinationId, timeShiftMinutes = 0, mode } = await req.json() as {
      direction: string;
      originId?: string;
      destinationId?: string;
      timeShiftMinutes?: number;
      mode?: string;
    };

    const requestedShiftMinutes = Math.max(
      0,
      // Trafiklab realtime timetables supports roughly 24h lookback.
      // Keep a one-hour safety margin to avoid boundary errors.
      Math.min(1380, Number(timeShiftMinutes) || 0),
    );
    
    // Backward-compatible and fault-tolerant direction parsing.
    const rawDirection = String(direction ?? "").trim().toLowerCase();
    const normalizedDirection: Direction = (() => {
      const malmoAliases = new Set([
        "malmo-departures",
        "malmo_to_hyllie",
        "malmo-to-hyllie",
        "malmo-to-copenhagen",
        "malmo_to_copenhagen",
        "malmo",
      ]);
      const cphAliases = new Set([
        "hyllie-departures",
        "hyllie_to_malmo",
        "hyllie-to-malmo",
        "copenhagen-to-malmo",
        "copenhagen_to_malmo",
        "copenhagen",
      ]);

      if (malmoAliases.has(rawDirection)) return "malmo-departures";
      if (cphAliases.has(rawDirection)) return "hyllie-departures";

      console.warn(`Unknown direction '${rawDirection}', defaulting to malmo-departures`);
      return "malmo-departures";
    })();

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

    if (mode === "collect-corridor") {
      if (!supabase) throw new Error("Supabase env vars missing, cannot collect corridor.");
      const collectOneDirection = async (collectDirection: Direction) => {
        const collectRoute = ROUTES[collectDirection];
        const collectOrigin = collectRoute.origin;
        const collectDestination = collectRoute.destination;
        const collectCacheKey = `${collectDirection}|${requestedShiftMinutes}|${collectOrigin.id}|${collectDestination.id}|collect`;
        const cachedCollector = getCachedPayload(collectCacheKey, RESPONSE_CACHE_TTL_MS);
        if (cachedCollector) return cachedCollector;

        const apiKey = Deno.env.get('TRAFIKLAB_REALTIME_API_KEY');
        if (!apiKey) {
          throw new Error('TRAFIKLAB_REALTIME_API_KEY not configured');
        }

        const anchorTime = new Date(Date.now() - requestedShiftMinutes * 60_000);
        const queryDateTime = formatDateTime(anchorTime);
        const departuresUrl = `https://realtime-api.trafiklab.se/v1/departures/${collectOrigin.id}/${queryDateTime}?key=${apiKey}`;
        const arrivalsUrl = `https://realtime-api.trafiklab.se/v1/arrivals/${collectDestination.id}/${queryDateTime}?key=${apiKey}`;
        const departuresResponse = await fetch(departuresUrl);
        const arrivalsResponse = await fetch(arrivalsUrl);
        if (!departuresResponse.ok) {
          throw new Error(`Collector departures API error: ${departuresResponse.status}`);
        }
        const departuresData: RealtimeResponse = await departuresResponse.json();
        const arrivalsData: RealtimeResponse = arrivalsResponse.ok ? await arrivalsResponse.json() : { arrivals: [] };
        const departuresPrimary = departuresData.departures ?? [];
        const arrivalsPrimary = arrivalsData.arrivals ?? [];

        const departuresByTripPrimary = new Set(
          departuresPrimary
            .map((dep) => tripKey(dep))
            .filter((key) => Boolean(key))
        );
        const arrivalsByTripPrimary = new Set(
          arrivalsPrimary
            .map((arr) => tripKey(arr))
            .filter((key) => Boolean(key))
        );
        const matchedPrimary = [...departuresByTripPrimary].filter((key) => arrivalsByTripPrimary.has(key)).length;
        const matchRatePrimary = departuresByTripPrimary.size > 0 ? matchedPrimary / departuresByTripPrimary.size : 1;
        const shouldFetchSecondary = matchRatePrimary < MATCH_RATE_FOR_SECONDARY_WINDOW;

        let departuresMerged = [...departuresPrimary];
        let arrivalsMerged = [...arrivalsPrimary];
        if (shouldFetchSecondary) {
          const departuresFutureAnchor = new Date(anchorTime.getTime() + 60 * 60_000);
          const departuresFutureDateTime = formatDateTime(departuresFutureAnchor);
          const arrivalsFutureDateTime = departuresFutureDateTime;
          const departuresFutureUrl = `https://realtime-api.trafiklab.se/v1/departures/${collectOrigin.id}/${departuresFutureDateTime}?key=${apiKey}`;
          const arrivalsFutureUrl = `https://realtime-api.trafiklab.se/v1/arrivals/${collectDestination.id}/${arrivalsFutureDateTime}?key=${apiKey}`;
          const [depFutureResp, arrFutureResp] = await Promise.all([fetch(departuresFutureUrl), fetch(arrivalsFutureUrl)]);
          const depFutureData: RealtimeResponse = depFutureResp.ok ? await depFutureResp.json() : { departures: [] };
          const arrFutureData: RealtimeResponse = arrFutureResp.ok ? await arrFutureResp.json() : { arrivals: [] };
          departuresMerged = departuresMerged.concat(depFutureData.departures ?? []);
          arrivalsMerged = arrivalsMerged.concat(arrFutureData.arrivals ?? []);
        }

        const corridorDepartures = departuresMerged
          .filter((dep) => normalizeText(dep.route?.transport_mode ?? '') === 'train')
          .filter((dep) => COPENHAGEN_CORRIDOR_LINES.has(String(dep.route?.designation ?? '').trim()));
        const corridorArrivals = arrivalsMerged
          .filter((arr) => normalizeText(arr.route?.transport_mode ?? '') === 'train')
          .filter((arr) => COPENHAGEN_CORRIDOR_LINES.has(String(arr.route?.designation ?? '').trim()));

        const arrivalsByTrip = new Map<string, RealtimeDeparture>();
        for (const arr of corridorArrivals) {
          const key = tripKey(arr);
          if (key && !arrivalsByTrip.has(key)) arrivalsByTrip.set(key, arr);
        }

        const windows: CorridorWindowRow[] = [];
        const pairs = corridorPairsForDirection(collectDirection);
        for (const dep of corridorDepartures) {
          const key = tripKey(dep);
          if (!key) continue;
          const matchArrival = arrivalsByTrip.get(key);
          if (!matchArrival) continue;
          const depIso = dep.realtime || dep.scheduled;
          const actualArrIso = matchArrival.realtime || matchArrival.scheduled || null;
          const scheduledArrIso = matchArrival.scheduled || null;
          const actualSec = timeToSeconds(actualArrIso ? isoTime(actualArrIso) : null);
          const schedSec = timeToSeconds(scheduledArrIso ? isoTime(scheduledArrIso) : null);
          const delayMinutes =
            actualSec !== null && schedSec !== null
              ? Math.round((actualSec - schedSec) / 60)
              : 0;
          const depLine = dep.route?.designation || '';
          const depLineName = dep.route?.name || dep.route?.designation || 'Train';

          for (const pair of pairs) {
            const o = stopById(pair.originId);
            const d = stopById(pair.destinationId);
            if (!o || !d) continue;
            const eventKey = [
              collectDirection,
              key,
              o.id,
              d.id,
              depIso,
            ].join("|");
            windows.push({
              event_key: eventKey,
              direction: collectDirection,
              trip_key: key,
              line: depLine,
              line_name: depLineName,
              origin_stop_id: o.id,
              origin_stop_name: o.name,
              destination_stop_id: d.id,
              destination_stop_name: d.name,
              departure_datetime: depIso,
              scheduled_arrival_datetime: scheduledArrIso,
              actual_arrival_datetime: actualArrIso,
              arrival_delay_minutes: delayMinutes,
              claimable: delayMinutes >= DELAY_ALERT_MINUTES,
            });
          }
        }

        if (windows.length > 0) {
          const { error: upsertError } = await supabase
            .from("claimable_corridor_windows")
            .upsert(windows, { onConflict: "event_key", ignoreDuplicates: false });
          if (upsertError) console.error("Error writing claimable_corridor_windows:", upsertError);
        }
        const expiryCutoff = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
        await supabase
          .from("claimable_corridor_windows")
          .delete()
          .lt("departure_datetime", expiryCutoff);

        const payload: EdgePayload = {
          direction: collectDirection,
          updatedAt: new Date().toISOString(),
          departures: windows.map(toUiDeparture),
        };
        responseCache.set(collectCacheKey, { storedAt: Date.now(), payload });
        return payload;
      };

      const [malmoPayload, cphPayload] = await Promise.all([
        collectOneDirection("malmo-departures"),
        collectOneDirection("hyllie-departures"),
      ]);

      return new Response(
        JSON.stringify({
          direction: "both",
          updatedAt: new Date().toISOString(),
          departures: [...(malmoPayload.departures ?? []), ...(cphPayload.departures ?? [])],
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const route = ROUTES[normalizedDirection];
    if (!route) {
      throw new Error('Invalid direction configuration');
    }

    const origin = originId
      ? Object.values(STOPS).find((s) => s.id === originId) ?? route.origin
      : route.origin;
    const destination = destinationId
      ? Object.values(STOPS).find((s) => s.id === destinationId) ?? route.destination
      : route.destination;
    cacheKey = `${normalizedDirection}|${requestedShiftMinutes}|${origin.id}|${destination.id}`;
    const cachedFresh = getCachedPayload(cacheKey, RESPONSE_CACHE_TTL_MS);
    if (cachedFresh) {
      return new Response(JSON.stringify(cachedFresh), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!supabase) {
      throw new Error("Supabase env vars missing, cannot read corridor windows.");
    }

    // UI read path: read from precomputed corridor windows only.
    if (originId && destinationId) {
      const rowsResp = await supabase
        .from("claimable_corridor_windows")
        .select(
          "event_key,direction,trip_key,line,line_name,origin_stop_id,origin_stop_name,destination_stop_id,destination_stop_name,departure_datetime,scheduled_arrival_datetime,actual_arrival_datetime,arrival_delay_minutes,claimable,observed_at"
        )
        .eq("origin_stop_id", originId)
        .eq("destination_stop_id", destinationId)
        .eq("direction", normalizedDirection)
        .order("departure_datetime", { ascending: false })
        .limit(300);
      if (rowsResp.error) {
        throw rowsResp.error;
      }
      const rows = (rowsResp.data ?? []) as CorridorWindowRow[];
      const payload: EdgePayload = {
        direction: normalizedDirection,
        updatedAt: new Date().toISOString(),
        departures: rows.map(toUiDeparture),
      };
      responseCache.set(cacheKey, { storedAt: Date.now(), payload });
      return new Response(JSON.stringify(payload), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = Deno.env.get('TRAFIKLAB_REALTIME_API_KEY');
    if (!apiKey) {
      throw new Error('TRAFIKLAB_REALTIME_API_KEY not configured');
    }

    // Use configured route origin as departure station
    const boardStationId = origin.id;
    const boardStationName = origin.name;
    
    const targetStationName = destination.name;

    const anchorTime = new Date(Date.now() - requestedShiftMinutes * 60_000);
    const queryDateTime = formatDateTime(anchorTime);
    const departuresUrl = `https://realtime-api.trafiklab.se/v1/departures/${boardStationId}/${queryDateTime}?key=${apiKey}`;
    const departuresFutureAnchor = new Date(anchorTime.getTime() + 60 * 60_000);
    const departuresFutureDateTime = formatDateTime(departuresFutureAnchor);
    const departuresFutureUrl = `https://realtime-api.trafiklab.se/v1/departures/${boardStationId}/${departuresFutureDateTime}?key=${apiKey}`;
    const arrivalsUrl = `https://realtime-api.trafiklab.se/v1/arrivals/${destination.id}/${queryDateTime}?key=${apiKey}`;
    const arrivalsFutureAnchor = new Date(anchorTime.getTime() + 60 * 60_000);
    const arrivalsFutureDateTime = formatDateTime(arrivalsFutureAnchor);
    const arrivalsFutureUrl = `https://realtime-api.trafiklab.se/v1/arrivals/${destination.id}/${arrivalsFutureDateTime}?key=${apiKey}`;
    console.log(`Fetching realtime departures from ${boardStationName} at ${queryDateTime}`);

    const [departuresResponse, arrivalsResponse] = await Promise.all([
      fetch(departuresUrl),
      fetch(arrivalsUrl),
    ]);

    if (!departuresResponse.ok) {
      const stale =
        getCachedPayload(cacheKey, STALE_CACHE_MAX_AGE_MS) ??
        getCachedPayload(`${normalizedDirection}|0|${origin.id}|${destination.id}`, STALE_CACHE_MAX_AGE_MS);
      if (stale) {
        return new Response(JSON.stringify(stale), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`Trafiklab API error: ${departuresResponse.status}`);
    }

    const departuresData: RealtimeResponse = await departuresResponse.json();
    const arrivalsData: RealtimeResponse = arrivalsResponse.ok
      ? await arrivalsResponse.json()
      : { arrivals: [] };
    const departuresPrimary = departuresData.departures ?? [];
    const arrivalsPrimary = arrivalsData.arrivals ?? [];
    const departuresByTripPrimary = new Set(
      departuresPrimary.map((dep) => tripKey(dep)).filter((k) => Boolean(k))
    );
    const arrivalsByTripPrimary = new Set(
      arrivalsPrimary.map((arr) => tripKey(arr)).filter((k) => Boolean(k))
    );
    const primaryMatches = [...departuresByTripPrimary].filter((k) => arrivalsByTripPrimary.has(k)).length;
    const primaryMatchRate = departuresByTripPrimary.size > 0 ? primaryMatches / departuresByTripPrimary.size : 1;
    const shouldFetchSecondaryWindow = primaryMatchRate < MATCH_RATE_FOR_SECONDARY_WINDOW;
    let departuresMerged = [...departuresPrimary];
    let arrivalsMerged = [...arrivalsPrimary];
    if (shouldFetchSecondaryWindow) {
      const [depFutureResp, arrFutureResp] = await Promise.all([
        fetch(departuresFutureUrl),
        fetch(arrivalsFutureUrl),
      ]);
      const depFutureData: RealtimeResponse = depFutureResp.ok ? await depFutureResp.json() : { departures: [] };
      const arrFutureData: RealtimeResponse = arrFutureResp.ok ? await arrFutureResp.json() : { arrivals: [] };
      departuresMerged = departuresMerged.concat(depFutureData.departures ?? []);
      arrivalsMerged = arrivalsMerged.concat(arrFutureData.arrivals ?? []);
    }
    const departuresByKey = new Map<string, RealtimeDeparture>();
    for (const dep of departuresMerged) {
      const key = departureKey(dep);
      if (key && !departuresByKey.has(key)) {
        departuresByKey.set(key, dep);
      }
    }
    const departures = Array.from(departuresByKey.values());
    const arrivals = arrivalsMerged;

    // Stage 1: train only
    const trainDepartures = departures.filter((dep) =>
      normalizeText(dep.route?.transport_mode ?? '') === 'train'
    );

    // Stage 2: corridor lines only
    const corridorDepartures = trainDepartures.filter((dep) =>
      COPENHAGEN_CORRIDOR_LINES.has(String(dep.route?.designation ?? '').trim())
    );

    // Stage 3: direction filter.
    // For explicit origin+destination station queries, keep all corridor departures from
    // the selected origin and let trip-based arrival matching determine correctness.
    const directionDepartures =
      originId || destinationId
        ? corridorDepartures
        : corridorDepartures.filter((dep) => {
            const originName = dep.route?.origin?.name ?? '';
            const destinationName = dep.route?.destination?.name ?? '';
            const directionName = dep.route?.direction ?? '';

            if (normalizedDirection === 'malmo-departures') {
              return isCopenhagen(destinationName) || isCopenhagen(directionName);
            }

            return isMalmo(destinationName) || isMalmo(directionName) || isCopenhagen(originName);
          });

    if (!departures.length) {
      return new Response(
        JSON.stringify({
          direction: normalizedDirection,
          updatedAt: new Date().toISOString(),
          departures: [],
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Build arrivals lookup by trip key
    const arrivalCandidates = arrivals
      .filter((arr) => normalizeText(arr.route?.transport_mode ?? '') === 'train')
      .filter((arr) => COPENHAGEN_CORRIDOR_LINES.has(String(arr.route?.designation ?? '').trim()));
    const arrivalsByTrip = new Map<string, RealtimeDeparture>();
    for (const arr of arrivalCandidates) {
      const key = tripKey(arr);
      if (key && !arrivalsByTrip.has(key)) {
        arrivalsByTrip.set(key, arr);
      }
    }
    const matchedDepartures = directionDepartures.filter((dep) => {
      const key = tripKey(dep);
      return Boolean(key && arrivalsByTrip.has(key));
    });
    const departuresToProcess = matchedDepartures.length > 0 ? matchedDepartures : directionDepartures;

    // Process departures and keep arrival ISO metadata for persistence checks.
    const processedWithArrivalMeta = departuresToProcess.map((dep) => {
      const scheduledDate = isoDate(dep.scheduled);
      const scheduledTime = isoTime(dep.scheduled);
      const realtimeDate = isoDate(dep.realtime);
      const realtimeTime = isoTime(dep.realtime);
      const matchedArrival = arrivalsByTrip.get(tripKey(dep));
      const actualArrivalIso = matchedArrival ? (matchedArrival.realtime || matchedArrival.scheduled || null) : null;
      const scheduledArrivalIso = matchedArrival ? (matchedArrival.scheduled || null) : null;
      const arrivalDate = actualArrivalIso ? isoDate(actualArrivalIso) : null;
      const arrivalTime = actualArrivalIso ? isoTime(actualArrivalIso) : null;
      const scheduledArrivalTime = scheduledArrivalIso ? isoTime(scheduledArrivalIso) : null;
      const arrivalRealtimeSeconds = timeToSeconds(arrivalTime);
      const arrivalScheduledSeconds = timeToSeconds(scheduledArrivalTime);
      const arrivalDeviationMinutes =
        arrivalRealtimeSeconds !== null && arrivalScheduledSeconds !== null
          ? Math.round((arrivalRealtimeSeconds - arrivalScheduledSeconds) / 60)
          : 0;
      const isArrivalDelayed = arrivalDeviationMinutes > 0;
      const isArrivalEarly = arrivalDeviationMinutes < 0;
      const delaySeconds = Number(dep.delay ?? 0);
      const isDelayed = delaySeconds > 0;

      return {
        actualArrivalIso,
        scheduledArrivalIso,
        departureIso: dep.realtime || dep.scheduled,
        payload: {
        line: dep.route?.designation || '',
        operator: dep.agency?.name || 'Unknown',
        lineName: dep.route?.name || dep.route?.designation || 'Train',
        transportCategory: dep.route?.transport_mode || "TRAIN",
        // Always show the selected board station in cards.
        // Trip origin may be an upstream station (e.g. Landskrona) and is confusing here.
        departureStation: boardStationName,
        departureStationId: boardStationId,
        arrivalStation: targetStationName,
        departureTime: realtimeTime || scheduledTime,
        departureDate: realtimeDate || scheduledDate,
        scheduledTime,
        arrivalTime,
        arrivalDate,
        scheduledArrivalTime,
        isArrivalDelayed,
        isArrivalEarly,
        arrivalDelayMinutes: arrivalDeviationMinutes,
        track: dep.realtime_platform?.designation || dep.scheduled_platform?.designation || undefined,
        isDelayed,
        delayMinutes: isDelayed ? Math.max(1, Math.round(delaySeconds / 60)) : 0,
        },
      };
    });
    const processedDepartures = processedWithArrivalMeta.map((row) => row.payload);

    // Store train names and departures in database
    try {
      if (!supabase) {
        throw new Error("Supabase env vars missing, skipping storage");
      }

      // Store train names (only those containing "tåg")
      const trainNames = processedDepartures
        .map(d => d.lineName)
        .filter(name => name.toLowerCase().includes('tåg'))
        .filter((name, index, self) => self.indexOf(name) === index);

      for (const name of trainNames) {
        await supabase
          .from('train_names')
          .upsert(
            { name, last_seen: new Date().toISOString() },
            { onConflict: 'name', ignoreDuplicates: false }
          );
      }
      
      console.log(`Stored ${trainNames.length} train names in database`);

      // Store all departures in database
      const departuresForDb = processedDepartures.map(dep => ({
        line: dep.line,
        operator: dep.operator,
        line_name: dep.lineName,
        departure_station: dep.departureStation,
        arrival_station: dep.arrivalStation,
        departure_time: dep.departureTime,
        departure_date: dep.departureDate,
        scheduled_time: dep.scheduledTime || null,
        arrival_time: dep.arrivalTime,
        arrival_date: dep.arrivalDate,
        track: dep.track || null,
        is_delayed: dep.isDelayed,
        delay_minutes: dep.delayMinutes || 0,
      }));

      const { error: departuresError } = await supabase
        .from('departures')
        .insert(departuresForDb);

      if (departuresError) {
        console.error('Error storing departures:', departuresError);
      } else {
        console.log(`Stored ${departuresForDb.length} departures in database`);
      }

      const confirmedDelayRows = processedWithArrivalMeta
        .filter((row) => {
          const dep = row.payload;
          if (!row.actualArrivalIso || !row.scheduledArrivalIso) return false;
          if ((dep.arrivalDelayMinutes ?? 0) < DELAY_ALERT_MINUTES) return false;
          return true;
        })
        .map((row) => {
          const dep = row.payload;
          const actualArrivalIso = row.actualArrivalIso as string;
          const scheduledArrivalIso = row.scheduledArrivalIso as string;
          const departureIso = row.departureIso || `${dep.departureDate}T${dep.departureTime}`;
          const eventKey = [
            normalizedDirection,
            dep.line,
            departureIso,
            actualArrivalIso,
          ].join("|");
          return {
            event_key: eventKey,
            direction: normalizedDirection,
            line: dep.line,
            line_name: dep.lineName,
            departure_station: dep.departureStation,
            arrival_station: dep.arrivalStation,
            departure_datetime: departureIso,
            scheduled_arrival_datetime: scheduledArrivalIso,
            actual_arrival_datetime: actualArrivalIso,
            arrival_delay_minutes: dep.arrivalDelayMinutes ?? 0,
          };
        });

      if (confirmedDelayRows.length > 0) {
        const { error: historyError } = await supabase
          .from('yellow_alert_history')
          .upsert(confirmedDelayRows, { onConflict: 'event_key', ignoreDuplicates: false });
        if (historyError) {
          console.error('Error storing confirmed delay alerts:', historyError);
        } else {
          console.log(`Stored ${confirmedDelayRows.length} confirmed delay alerts`);
        }
      }

      // Keep runs/departures for up to 72 hours to reduce repeated external API lookups.
      const seventyTwoHoursAgo = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
      const { error: cleanupError } = await supabase
        .from('departures')
        .delete()
        .lt('fetched_at', seventyTwoHoursAgo);

      if (cleanupError) {
        console.error('Error cleaning up old departures:', cleanupError);
      } else {
        console.log('Successfully cleaned up departures older than 72 hours');
      }

      // Keep claimable alert history for 30 days.
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { error: historyCleanupError } = await supabase
        .from('yellow_alert_history')
        .delete()
        .lt('actual_arrival_datetime', thirtyDaysAgo);
      if (historyCleanupError) {
        console.error('Error cleaning up old delay alerts:', historyCleanupError);
      } else {
        console.log('Successfully cleaned up delay alerts older than 30 days');
      }
    } catch (dbError) {
      console.error('Error with database operations:', dbError);
    }

    console.log(`Found ${processedDepartures.length} departures from ${boardStationName}`);

    const payload: EdgePayload = {
      direction: normalizedDirection,
      updatedAt: new Date().toISOString(),
      departures: processedDepartures,
    };
    responseCache.set(cacheKey, { storedAt: Date.now(), payload });
    if (requestedShiftMinutes === 0) {
      responseCache.set(`${normalizedDirection}|0|${origin.id}|${destination.id}`, { storedAt: Date.now(), payload });
    }
    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in get-train-departures:', error);
    const stale = getCachedPayload(cacheKey, STALE_CACHE_MAX_AGE_MS);
    if (stale) {
      return new Response(JSON.stringify(stale), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
