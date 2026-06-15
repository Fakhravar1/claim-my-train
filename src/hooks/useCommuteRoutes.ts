import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * One monitored commute: a back-and-forth O-D pair with per-direction time
 * windows and the weekdays it's watched on. Drives the delay-digest selection
 * (CLAUDE.md §16). Replaces the old single flat profiles.commuter_* commute.
 *
 * `monitored_days` uses ISO weekday numbers (1=Mon … 7=Sun); an empty array
 * means the route is paused. Null time windows mean that direction matches all
 * day. `id` is the DB row id for persisted routes, or a client-only temp id for
 * unsaved cards (stripped before insert — the DB generates the real id).
 */
export interface CommuteRoute {
  id: string;
  from_stop_id: string;
  to_stop_id: string;
  outbound_start_time: string | null;
  outbound_end_time: string | null;
  return_start_time: string | null;
  return_end_time: string | null;
  monitored_days: number[];
}

export const ALL_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

const emptyToNull = (v: string | null | undefined) => (v && v.trim() ? v : null);

/** Fetch the user's saved commute routes, oldest first. */
export function useCommuteRoutes(userId: string | undefined) {
  return useQuery<CommuteRoute[]>({
    queryKey: ["commute-routes", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("commute_routes")
        .select(
          "id, from_stop_id, to_stop_id, outbound_start_time, outbound_end_time, return_start_time, return_end_time, monitored_days"
        )
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CommuteRoute[];
    },
  });
}

/**
 * Persist the user's routes via replace-all: delete every existing row for the
 * user, then insert the current list. Routes are few, so this is simpler and
 * safer than diffing per-row. Only routes with both stops set are kept; the DB
 * generates the real id (client temp ids are dropped).
 */
export async function saveRoutes(userId: string, routes: CommuteRoute[]) {
  const { error: delError } = await supabase
    .from("commute_routes")
    .delete()
    .eq("user_id", userId);
  if (delError) throw delError;

  const rows = routes
    .filter((r) => r.from_stop_id && r.to_stop_id)
    .map((r) => ({
      user_id: userId,
      from_stop_id: r.from_stop_id,
      to_stop_id: r.to_stop_id,
      outbound_start_time: emptyToNull(r.outbound_start_time),
      outbound_end_time: emptyToNull(r.outbound_end_time),
      return_start_time: emptyToNull(r.return_start_time),
      return_end_time: emptyToNull(r.return_end_time),
      monitored_days: r.monitored_days,
    }));

  if (rows.length === 0) return;
  const { error: insError } = await supabase.from("commute_routes").insert(rows);
  if (insError) throw insError;
}
