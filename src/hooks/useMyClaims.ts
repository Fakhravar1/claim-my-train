import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type ClaimOutcome = "paid_out" | "denied" | null;

export type Claim = Tables<"claims">;

/**
 * The signed-in user's filed claims, newest first. RLS on public.claims
 * (select where auth.uid() = user_id) already scopes this to own rows, so we
 * don't filter by user_id here — but we gate the query on a userId so it only
 * runs once a session exists.
 */
export function useMyClaims(userId: string | undefined) {
  return useQuery<Claim[]>({
    queryKey: ["my-claims", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("claims")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60 * 1000,
  });
}
