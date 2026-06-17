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
 * One tiny query per bucket, run in parallel; combined, deduped and sorted
 * cancelled-first then worst-delay-first.
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

export function useNetworkBoard(date: string, enabled = true) {
  return useQuery<Journey[]>({
    queryKey: ["network-board", date],
    enabled,
    queryFn: async () => {
      const results = await Promise.all(
        BUCKETS.map(async ({ apply, n }) => {
          const { data, error } = await apply(
            supabase.from("v_journeys").select("*").eq("origin_local_date", date)
          ).limit(n);
          if (error) throw error;
          return (data ?? []) as Journey[];
        })
      );

      // Dedupe (a row can't match two buckets, but guard anyway) and order:
      // cancelled first, then by delay descending.
      const seen = new Set<string>();
      const rows: Journey[] = [];
      for (const j of results.flat()) {
        const key = j.journey_key ?? "";
        if (key && seen.has(key)) continue;
        if (key) seen.add(key);
        rows.push(j);
      }
      rows.sort((a, b) => {
        if (Boolean(a.canceled) !== Boolean(b.canceled)) return a.canceled ? -1 : 1;
        return (b.destination_delay_minutes ?? 0) - (a.destination_delay_minutes ?? 0);
      });
      return rows;
    },
    staleTime: 5 * 60 * 1000,
  });
}
