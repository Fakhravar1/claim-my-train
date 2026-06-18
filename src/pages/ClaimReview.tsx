import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useDaylightStyles } from "@/hooks/useDaylightStyles";
import { supabase } from "@/integrations/supabase/client";
import { type Journey } from "@/hooks/useJourneys";
import { buildClaimPayload } from "@/hooks/useStartClaim";
import { useMyClaims } from "@/hooks/useMyClaims";
import { isSupportedPurchasingOperator, purchasingOperatorLabel } from "@/lib/claimProfileValidation";
import { Nav, Footer } from "@/components/daylight/shell";

const PAYOUT_LABELS: Record<string, string> = {
  bank: "Bank transfer",
  sms: "SMS voucher",
  email: "Email voucher",
};

const STOCKHOLM_TIME_ZONE = "Europe/Stockholm";
const fmtTime = new Intl.DateTimeFormat("sv-SE", {
  timeZone: STOCKHOLM_TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: false,
});
const fmtDate = new Intl.DateTimeFormat("sv-SE", {
  timeZone: STOCKHOLM_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
});
// Day-group header: weekday + date, e.g. "Monday, 15 June 2026".
const fmtDayHeader = new Intl.DateTimeFormat("en-GB", {
  timeZone: STOCKHOLM_TIME_ZONE, weekday: "long", year: "numeric", month: "long", day: "numeric",
});
const t = (iso: string | null | undefined) => (iso ? fmtTime.format(new Date(iso)) : "—");
const d = (iso: string | null | undefined) => (iso ? fmtDate.format(new Date(iso)) : "—");

/**
 * Bulk claim review at `/claim-review?journeys=k1,k2,…` — the landing page for
 * the digest email's "Review & claim" button (also usable standalone). Lists
 * the journeys named in the query, all pre-checked; one confirm files every
 * checked claim through the same snapshot/consent path as the single-claim
 * dialog. Daylight-themed (the region pages it replaced are retired).
 */
export default function ClaimReview() {
  useDaylightStyles();

  const { user, profile, loading: authLoading, signOut, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const journeyKeys = useMemo(
    () => (searchParams.get("journeys") ?? "").split(",").map((k) => k.trim()).filter(Boolean),
    [searchParams]
  );

  const { data: journeys = [], isLoading } = useQuery<Journey[]>({
    queryKey: ["claim-review", journeyKeys],
    enabled: journeyKeys.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_claimable_journeys")
        .select("*")
        .in("journey_key", journeyKeys)
        .order("origin_scheduled", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Journey[];
    },
  });

  const { data: myClaims = [] } = useMyClaims(user?.id);
  const claimedKeys = useMemo(() => new Set(myClaims.map((c) => c.journey_key)), [myClaims]);

  const claimable = useMemo(
    () => journeys.filter((j) => j.journey_key && !claimedKeys.has(j.journey_key)),
    [journeys, claimedKeys]
  );

  // Group journeys by Stockholm travel day so a multi-day digest is easy to scan.
  // journeys arrive ordered by origin_scheduled asc, so Map insertion order is
  // already chronological.
  const groupedByDay = useMemo(() => {
    const map = new Map<string, { label: string; items: Journey[] }>();
    for (const j of journeys) {
      const key = d(j.origin_scheduled);
      const label = j.origin_scheduled ? fmtDayHeader.format(new Date(j.origin_scheduled)) : key;
      if (!map.has(key)) map.set(key, { label, items: [] });
      map.get(key)!.items.push(j);
    }
    return [...map.values()];
  }, [journeys]);

  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [initialized, setInitialized] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [filedCount, setFiledCount] = useState<number | null>(null);

  // Pre-check everything still claimable, once, when data arrives.
  useEffect(() => {
    if (initialized || claimable.length === 0) return;
    setChecked(new Set(claimable.map((j) => j.journey_key as string)));
    setInitialized(true);
  }, [claimable, initialized]);

  const allChecked = claimable.length > 0 && claimable.every((j) => checked.has(j.journey_key as string));
  const toggleAll = () =>
    setChecked(allChecked ? new Set() : new Set(claimable.map((j) => j.journey_key as string)));
  const toggleOne = (key: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // Same completeness rule as the single-claim dialog: every field printed on
  // the Skånetrafiken form must be present, signature included.
  const claimProfile = useMemo(() => {
    const fields: { label: string; value: string }[] = [
      { label: "Name", value: [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") },
      { label: "Personnummer", value: profile?.claim_personnummer ?? "" },
      {
        label: "Address",
        value: [profile?.street_address, [profile?.postal_code, profile?.city].filter(Boolean).join(" ")]
          .filter(Boolean)
          .join(", "),
      },
      { label: "Mobile", value: profile?.claim_mobile ?? "" },
      { label: "Email", value: profile?.claim_email ?? "" },
      { label: "Ticket ID", value: profile?.claim_ticket_id ?? "" },
      {
        label: "Payout method",
        value: profile?.payout_method ? PAYOUT_LABELS[profile.payout_method] ?? profile.payout_method : "",
      },
      { label: "Signature", value: profile?.signature_path ? "On file" : "" },
    ];
    const missing = fields.filter((f) => !f.value.trim()).map((f) => f.label);
    return { missing };
  }, [profile]);

  // Guardrail: only Skånetrafiken-ticket holders can file for now (§1).
  const operatorSupported = isSupportedPurchasingOperator(profile?.purchasing_operator);

  const handleFile = async () => {
    if (!user || checked.size === 0 || !operatorSupported) return;
    setSubmitting(true);
    try {
      const rows = claimable
        .filter((j) => checked.has(j.journey_key as string))
        .map((j) => buildClaimPayload(j, user.id, profile?.signature_path ?? null));
      // ignoreDuplicates: a stale email can never double-file — the unique
      // (user_id, journey_key, trip_start_date) constraint silently skips dupes.
      const { error } = await supabase
        .from("claims")
        .upsert(rows, { onConflict: "user_id,journey_key,trip_start_date", ignoreDuplicates: true });
      if (error) {
        toast({ title: "Filing failed", description: error.message, variant: "destructive" });
        return;
      }
      setFiledCount(rows.length);
      queryClient.invalidateQueries({ queryKey: ["my-claims"] });
      toast({ title: `Filed ${rows.length} claim${rows.length === 1 ? "" : "s"}`, description: "We'll generate the forms — track them under Settings → My claims." });
    } finally {
      setSubmitting(false);
    }
  };

  // Round-trip OAuth back to this review URL (with its ?journeys=… payload).
  const loginNext = location.pathname + location.search;
  const accountLabel = profile?.full_name || profile?.first_name || user?.email || "Konto";

  return (
    <div className="cmt-daylight">
      <Helmet>
        <title>Granska & ansök — Qvitta</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      <Nav
        signedIn={Boolean(user)}
        accountLabel={accountLabel}
        onSignOut={() => void signOut()}
        onLogin={() => void signInWithGoogle(loginNext)}
      />

      <main className="wrap" style={{ paddingTop: "2rem", paddingBottom: "4rem", maxWidth: 720 }}>
        <h1 style={{ fontSize: "1.6rem", margin: "0 0 .25rem" }}>Granska &amp; ansök</h1>
        <p className="muted" style={{ margin: "0 0 1.5rem" }}>
          Sena avgångar på din pendling — bocka för det du reste och ansök på en gång.
        </p>

        {!authLoading && !user ? (
          <div className="board">
            <p style={{ marginBottom: 12 }}>Logga in för att granska och skicka in dessa ansökningar.</p>
            <button type="button" className="btn btn--dark" onClick={() => void signInWithGoogle(loginNext)}>
              Logga in
            </button>
          </div>
        ) : journeyKeys.length === 0 ? (
          <div className="board"><p className="muted">Inga resor att granska — öppna den här sidan från ett aviseringsmejl.</p></div>
        ) : isLoading ? (
          <div className="board"><p className="muted">Laddar resor…</p></div>
        ) : filedCount !== null ? (
          <div className="board">
            <p style={{ fontWeight: 600, marginBottom: 8 }}>✓ {filedCount} ansökning{filedCount === 1 ? "" : "ar"} inskickade</p>
            <p style={{ marginBottom: 12 }}>Blanketterna fylls i automatiskt. Följ status under Inställningar → Mina ansökningar.</p>
            <button type="button" className="btn btn--accent" onClick={() => navigate("/settings")}>Till Mina ansökningar</button>
          </div>
        ) : (
          <>
            {claimProfile.missing.length > 0 && (
              <div className="board" style={{ marginBottom: 16, borderColor: "var(--severe)" }}>
                <p style={{ fontWeight: 600 }}>Din ansökningsprofil är ofullständig</p>
                <p style={{ margin: "6px 0 12px" }}>
                  Saknas: {claimProfile.missing.join(", ")}. Ansökningar kan inte skickas in förrän dessa är sparade.
                </p>
                <button type="button" className="btn btn--ghost" onClick={() => navigate("/settings")}>Komplettera i Inställningar</button>
              </div>
            )}

            {!operatorSupported && (
              <div className="board" style={{ marginBottom: 16, borderColor: "var(--severe)" }}>
                <p style={{ fontWeight: 600 }}>Ansökningar stöds endast för Skånetrafiken-biljetter</p>
                <p style={{ margin: "6px 0 12px" }}>
                  {profile?.purchasing_operator
                    ? `Du valde ${purchasingOperatorLabel(profile.purchasing_operator)} som biljettleverantör. Ansökningar för andra operatörer stöds inte än.`
                    : "Ange var du köpte din biljett först — vi stöder för närvarande bara Skånetrafiken-biljetter."}
                </p>
                <button type="button" className="btn btn--ghost" onClick={() => navigate("/settings")}>Uppdatera biljettleverantör</button>
              </div>
            )}

            <div className="board">
              <label style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 600, cursor: "pointer", marginBottom: 4 }}>
                <input type="checkbox" checked={allChecked} onChange={toggleAll} disabled={claimable.length === 0} />
                Markera alla ({claimable.length})
              </label>

              {groupedByDay.map((group) => (
                <div key={group.label}>
                  <div
                    style={{
                      fontSize: 12, fontWeight: 700, textTransform: "uppercase",
                      letterSpacing: "0.04em", opacity: 0.6,
                      padding: "14px 0 4px", borderTop: "1px solid var(--board-line)", marginTop: 8,
                    }}
                  >
                    {group.label}
                  </div>
                  {group.items.map((j) => {
                    const key = j.journey_key as string;
                    const alreadyClaimed = claimedKeys.has(key);
                    return (
                      <label
                        key={key}
                        style={{
                          display: "flex", alignItems: "center", gap: 12, padding: "10px 0",
                          opacity: alreadyClaimed ? 0.55 : 1, cursor: alreadyClaimed ? "default" : "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={!alreadyClaimed && checked.has(key)}
                          disabled={alreadyClaimed}
                          onChange={() => toggleOne(key)}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600 }}>
                            {j.origin_stop_name} → {j.destination_stop_name}
                          </div>
                          <div style={{ fontSize: 13, opacity: 0.8 }}>
                            dep {t(j.origin_scheduled)} · arr {t(j.destination_scheduled)} → {t(j.destination_actual)}
                            {j.operator ? ` · ${j.operator}` : ""}
                          </div>
                        </div>
                        <span className={`tag ${j.canceled ? "tag--cancelled" : "tag--eligible"}`}>
                          {j.canceled ? "Inställt" : `+${Math.round(Number(j.destination_delay_minutes ?? 0))} min`}
                        </span>
                      </label>
                    );
                  })}
                </div>
              ))}

              {journeys.length === 0 && (
                <p className="muted" style={{ marginTop: 12 }}>Dessa resor går inte längre att ansöka om.</p>
              )}

              <div style={{ marginTop: 16 }}>
                <button
                  type="button"
                  className="btn btn--accent"
                  onClick={() => void handleFile()}
                  disabled={submitting || checked.size === 0 || claimProfile.missing.length > 0 || !operatorSupported}
                >
                  {submitting ? "Skickar…" : `Ansök om ${checked.size} ersättning${checked.size === 1 ? "" : "ar"}`}
                </button>
              </div>
              <p style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>
                Genom att ansöka intygar du att du reste på dessa avgångar och godkänner att din
                sparade underskrift används på Skånetrafikens blanketter. Falska ansökningar
                polisanmäls av Skånetrafiken.
              </p>
            </div>
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}
