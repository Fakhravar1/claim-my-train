import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Journey } from "@/hooks/useJourneys";

/**
 * Date-only, network-wide read for the live board (the design's "Förseningar i
 * nätet"). Unlike useJourneys, this is NOT gated on an O-D pair.
 *
 * Rather than dumping the most-delayed N (which saturates with eligible rows on
 * a busy day), it pulls a small, representative SAMPLE across every status tier
 * — a couple cancelled, severe, eligible, near, minor and an on-time — so the
 * board shows the full spread of statuses the colour-coding is meant to convey.
 * One small query per bucket, run in parallel; each bucket over-fetches and is
 * randomly down-sampled so the mix varies between loads, then everything is
 * combined, deduped and ordered by DEPARTURE TIME — the tiers are intentionally
 * NOT grouped together, just interleaved chronologically.
 */
type Bucket = { apply: (q: PostgrestQuery) => PostgrestQuery; n: number };
// Loose alias — the supabase query builder type is unwieldy to name precisely.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PostgrestQuery = any;

const BUCKETS: Bucket[] = [
  { n: 2, apply: (q) => q.eq("canceled", true) },
  { n: 2, apply: (q) => q.not("canceled", "is", true).gte("destination_delay_minutes", 40) },
  { n: 2, apply: (q) => q.not("canceled", "is", true).gte("destination_delay_minutes", 20).lt("destination_delay_minutes", 40) },
  { n: 1, apply: (q) => q.not("canceled", "is", true).gte("destination_delay_minutes", 15).lt("destination_delay_minutes", 20) },
  { n: 2, apply: (q) => q.not("canceled", "is", true).gte("destination_delay_minutes", 4).lt("destination_delay_minutes", 15) },
  { n: 1, apply: (q) => q.not("canceled", "is", true).lt("destination_delay_minutes", 4) },
];

/**
 * Date-scoped read of every journey that TOUCHES any of the given stations
 * (as origin OR destination) — powers the free-text "Sök station" box, which
 * resolves the typed name to one or more station ids. Distinct from useJourneys
 * (a single exact O-D pair) and useNetworkBoard (the tier sample): this is "show
 * me all trains through Lund C today", not a specific leg.
 */
export function useStationBoard(stationIds: string[], date: string, enabled = true) {
  const key = [...stationIds].sort().join(",");
  return useQuery<Journey[]>({
    queryKey: ["station-board", key, date],
    enabled: enabled && stationIds.length > 0,
    queryFn: async () => {
      const list = "(" + stationIds.join(",") + ")";
      const { data, error } = await supabase
        .from("v_journeys")
        .select("*")
        .eq("origin_local_date", date)
        .or(`origin_stop_id.in.${list},destination_stop_id.in.${list}`)
        .order("origin_scheduled", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Journey[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** In-place Fisher–Yates shuffle, returning the array for chaining. */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function useNetworkBoard(date: string, enabled = true) {
  return useQuery<Journey[]>({
    // `date` only — the random sampling happens inside queryFn, but we keep the
    // result stable for a session via react-query's cache (staleTime below) so
    // the board doesn't reshuffle on every re-render.
    queryKey: ["network-board", date],
    enabled,
    queryFn: async () => {
      const results = await Promise.all(
        BUCKETS.map(async ({ apply, n }) => {
          // Over-fetch, then randomly down-sample to `n` so the visible mix
          // varies between loads instead of always surfacing the same rows.
          const { data, error } = await apply(
            supabase.from("v_journeys").select("*").eq("origin_local_date", date)
          ).limit(Math.max(n * 6, 8));
          if (error) throw error;
          return shuffle((data ?? []) as Journey[]).slice(0, n);
        })
      );

      // Dedupe (a row can't match two buckets, but guard anyway), then order by
      // departure time so the eligibility tiers are interleaved chronologically
      // rather than clumped (cancelled-block, then severe-block, …).
      const seen = new Set<string>();
      const rows: Journey[] = [];
      for (const j of results.flat()) {
        const key = j.journey_key ?? "";
        if (key && seen.has(key)) continue;
        if (key) seen.add(key);
        rows.push(j);
      }
      rows.sort((a, b) =>
        (a.origin_scheduled ?? "").localeCompare(b.origin_scheduled ?? "")
      );
      return rows;
    },
    staleTime: 5 * 60 * 1000,
  });
}
