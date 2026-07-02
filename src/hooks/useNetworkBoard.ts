import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Journey } from "@/hooks/useJourneys";

/**
 * Date-only, network-wide read for the live board (the design's "Förseningar i
 * nätet"). Unlike useJourneys, this is NOT gated on an O-D pair.
 *
 * Reads the PRECOMPUTED sample table `public.v_network_board` (built once per
 * `dbt build` by agg_network_board): a tiny per-(date, tier) pool. We can't sample
 * the full fct_journeys view live — its per-day scan grew with the network (~240k
 * journeys/day) and blew anon's 3s statement_timeout, so the board showed nothing.
 * One index read (<100ms) fetches the whole day's pool; we shuffle each tier
 * client-side and take a few per tier, so the visible mix still varies between
 * loads. Rows are then interleaved by DEPARTURE TIME (tiers not clumped).
 */
// How many rows to surface per display tier (matches src/lib/daylightStatus.ts).
// The table holds up to 15 per tier; we shuffle and take these counts.
const TIER_TAKE: Record<string, number> = {
  cancelled: 2,
  severe: 2,
  eligible: 2,
  near: 1,
  minor: 2,
  ontime: 1,
};

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
      const { data, error } = await (supabase as any)
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
      // One index read of the whole day's precomputed pool (all tiers, <100ms).
      const { data, error } = await (supabase as any)
        .from("v_network_board")
        .select("*")
        .eq("origin_local_date", date);
      if (error) throw error;
      const pool = (data ?? []) as (Journey & { tier?: string })[];

      // Shuffle each tier's pool and take a few, so the visible mix varies between
      // loads even though the pool itself only refreshes on `dbt build`.
      const byTier = new Map<string, (Journey & { tier?: string })[]>();
      for (const j of pool) {
        const t = j.tier ?? "ontime";
        (byTier.get(t) ?? byTier.set(t, []).get(t)!).push(j);
      }
      const picked: Journey[] = [];
      for (const [tier, take] of Object.entries(TIER_TAKE)) {
        picked.push(...shuffle(byTier.get(tier) ?? []).slice(0, take));
      }

      // Order by departure time so tiers are interleaved chronologically rather
      // than clumped (cancelled-block, then severe-block, …).
      picked.sort((a, b) =>
        (a.origin_scheduled ?? "").localeCompare(b.origin_scheduled ?? "")
      );
      return picked;
    },
    staleTime: 5 * 60 * 1000,
  });
}
