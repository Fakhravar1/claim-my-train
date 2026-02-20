import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { ROUTES, Direction, STOPS } from '../shared/stops.ts'

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

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let cacheKey = "";

  try {
    const { direction, originId, destinationId, timeShiftMinutes = 0 } = await req.json() as {
      direction: string;
      originId?: string;
      destinationId?: string;
      timeShiftMinutes?: number;
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
    cacheKey = `${normalizedDirection}|${requestedShiftMinutes}`;
    const cachedFresh = getCachedPayload(cacheKey, RESPONSE_CACHE_TTL_MS);
    if (cachedFresh) {
      return new Response(JSON.stringify(cachedFresh), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

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

    const [departuresResponse, departuresFutureResponse, arrivalsResponse] = await Promise.all([
      fetch(departuresUrl),
      fetch(departuresFutureUrl),
      fetch(arrivalsUrl),
    ]);

    if (!departuresResponse.ok) {
      const stale = getCachedPayload(cacheKey, STALE_CACHE_MAX_AGE_MS) ?? getCachedPayload(`${normalizedDirection}|0`, STALE_CACHE_MAX_AGE_MS);
      if (stale) {
        return new Response(JSON.stringify(stale), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`Trafiklab API error: ${departuresResponse.status}`);
    }

    const departuresData: RealtimeResponse = await departuresResponse.json();
    const departuresFutureData: RealtimeResponse = departuresFutureResponse.ok
      ? await departuresFutureResponse.json()
      : { departures: [] };
    const arrivalsData: RealtimeResponse = arrivalsResponse.ok
      ? await arrivalsResponse.json()
      : { arrivals: [] };

    // A second arrivals window improves match rate for longer/late trips.
    const arrivalsFutureResponse = await fetch(arrivalsFutureUrl);
    const arrivalsFutureData: RealtimeResponse = arrivalsFutureResponse.ok
      ? await arrivalsFutureResponse.json()
      : { arrivals: [] };

    const departuresMerged = [
      ...(departuresData.departures ?? []),
      ...(departuresFutureData.departures ?? []),
    ];
    const departuresByKey = new Map<string, RealtimeDeparture>();
    for (const dep of departuresMerged) {
      const key = departureKey(dep);
      if (key && !departuresByKey.has(key)) {
        departuresByKey.set(key, dep);
      }
    }
    const departures = Array.from(departuresByKey.values());
    const arrivals = [
      ...(arrivalsData.arrivals ?? []),
      ...(arrivalsFutureData.arrivals ?? []),
    ];

    // Stage 1: train only
    const trainDepartures = departures.filter((dep) =>
      normalizeText(dep.route?.transport_mode ?? '') === 'train'
    );

    // Stage 2: corridor lines only
    const corridorDepartures = trainDepartures.filter((dep) =>
      COPENHAGEN_CORRIDOR_LINES.has(String(dep.route?.designation ?? '').trim())
    );

    // Stage 3: direction filter
    const directionDepartures = corridorDepartures.filter((dep) => {
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

    const departuresToProcess = directionDepartures;

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
        departureStation: dep.stop?.name || boardStationName,
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

      // Keep only six hours of history for the "Load earlier" browsing window.
      const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
      const { error: cleanupError } = await supabase
        .from('departures')
        .delete()
        .lt('fetched_at', sixHoursAgo);

      if (cleanupError) {
        console.error('Error cleaning up old departures:', cleanupError);
      } else {
        console.log('Successfully cleaned up departures older than 6 hours');
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
      responseCache.set(`${normalizedDirection}|0`, { storedAt: Date.now(), payload });
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
