import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { type Journey } from "@/hooks/useJourneys";
import { type CommuteRoute } from "@/hooks/useCommuteRoutes";

/**
 * All claimable delays on the user's monitored commute routes — the standing
 * "Mina förseningar" view (a persistent version of the digest email, §16).
 *
 * Reads `public.v_claimable_journeys` (the 90-day durable retention layer) for
 * every route's O-D pair in BOTH directions (outbound + return), unioned and
 * deduped by `journey_key`, newest first. Unlike the digest it does NOT apply
 * the per-direction time windows or monitored-day filter — the page shows
 * everything still filable on those routes, not just the windowed commute.
 * Already-claimed journeys are filtered out by the page via `useMyClaims`.
 */
export function useMyDelays(userId: string | undefined, routes: CommuteRoute[]) {
  const routeKey = routes.map((r) => `${r.from_stop_id}-${r.to_stop_id}`).join("|");
  return useQuery<Journey[]>({
    queryKey: ["my-delays", userId, routeKey],
    enabled: Boolean(userId) && routes.length > 0,
    queryFn: async () => {
      const since = new Date();
      since.setUTCDate(since.getUTCDate() - 90); // matches v_claimable_journeys retention
      const sinceDate = since.toISOString().slice(0, 10);

      // One OR clause per direction per route, e.g.
      //   and(origin_stop_id.eq.A,destination_stop_id.eq.B)
      const orClauses = routes
        .flatMap((r) => [
          `and(origin_stop_id.eq.${r.from_stop_id},destination_stop_id.eq.${r.to_stop_id})`,
          `and(origin_stop_id.eq.${r.to_stop_id},destination_stop_id.eq.${r.from_stop_id})`,
        ])
        .join(",");

      const { data, error } = await supabase
        .from("v_claimable_journeys")
        .select("*")
        .or(orClauses)
        .gte("origin_local_date", sinceDate)
        .order("origin_scheduled", { ascending: false }) // newest delays first
        .limit(500);
      if (error) throw error;

      // Dedupe by journey_key (a journey can match more than one route's pair).
      const seen = new Set<string>();
      const out: Journey[] = [];
      for (const j of (data ?? []) as Journey[]) {
        const k = j.journey_key as string;
        if (k && !seen.has(k)) {
          seen.add(k);
          out.push(j);
        }
      }
      return out;
    },
    staleTime: 5 * 60 * 1000,
  });
}
