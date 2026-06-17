import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { buildClaimPayload } from "@/hooks/useStartClaim";
import {
  loadPendingClaim,
  clearPendingClaim,
  buildProfileRow,
  dataUrlToBlob,
} from "@/lib/pendingClaim";

/**
 * When a logged-out user filed a claim but had to confirm their email first
 * (CLAUDE.md §3 footgun: signUp returns no session while email confirmation is
 * on), the journey + details + signature were stashed in localStorage. Once they
 * return authenticated, replay the writes — upload the signature, upsert the
 * profile, insert the claim — then refresh their profile and clear the stash.
 *
 * Mount this once on the `/` app page. Guards against double-execution (StrictMode
 * / re-renders) and only fires for the user who created the pending claim.
 */
export function usePendingClaimCompletion() {
  const { user, refreshProfile } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const ranFor = useRef<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const pending = loadPendingClaim();
    if (!pending || pending.userId !== user.id) return;
    if (ranFor.current === user.id) return;
    ranFor.current = user.id;

    let cancelled = false;
    (async () => {
      try {
        // 1. Signature → private own-folder bucket.
        let signaturePath: string | null = null;
        if (pending.signatureDataUrl) {
          const blob = dataUrlToBlob(pending.signatureDataUrl);
          const path = `${user.id}/signature.png`;
          const { error } = await supabase.storage
            .from("signatures")
            .upload(path, blob, { contentType: "image/png", upsert: true });
          if (error) throw error;
          signaturePath = path;
        }

        // 2. Profile row.
        const { error: pErr } = await supabase
          .from("profiles")
          .upsert(buildProfileRow(user.id, pending.details, signaturePath), { onConflict: "id" });
        if (pErr) throw pErr;

        // 3. The claim itself.
        const payload = buildClaimPayload(pending.journey, user.id, signaturePath);
        const { error: cErr } = await supabase.from("claims").insert(payload);
        if (cErr && cErr.code !== "23505") throw cErr;

        clearPendingClaim();
        if (cancelled) return;
        await refreshProfile();
        void queryClient.invalidateQueries({ queryKey: ["my-claims"] });
        toast({
          title: "Ansökan inskickad",
          description: "Tack för att du bekräftade din e-post — vi har skickat in din reklamation.",
        });
      } catch (e) {
        // Keep the stash so a later visit can retry; allow this session to retry too.
        ranFor.current = null;
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "Okänt fel";
        toast({
          title: "Kunde inte slutföra ansökan",
          description: msg,
          variant: "destructive",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, queryClient, toast, refreshProfile]);
}
