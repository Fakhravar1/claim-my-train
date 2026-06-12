import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { type Journey } from "@/hooks/useJourneys";
import { buildClaimPayload } from "@/hooks/useStartClaim";
import { useMyClaims } from "@/hooks/useMyClaims";
import { useAppShellStyles } from "@/hooks/useAppShellStyles";
import themeCSS from "@/themes/skanetrafiken/theme.css?inline";
import SkaneBand from "@/components/region/SkaneBand";
import RegionUserMenu from "@/components/region/RegionUserMenu";

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
const t = (iso: string | null | undefined) => (iso ? fmtTime.format(new Date(iso)) : "—");
const d = (iso: string | null | undefined) => (iso ? fmtDate.format(new Date(iso)) : "—");

/**
 * Bulk claim review — the landing page for the digest email's "Review & claim"
 * button (also usable standalone). Lists the journeys named in ?journeys=k1,k2,…,
 * all pre-checked; one confirm files every checked claim through the same
 * snapshot/consent path as the single-claim dialog.
 */
export default function SkanetrafikenClaimReview() {
  useAppShellStyles(themeCSS);

  const { user, profile, loading: authLoading } = useAuth();
  const [searchParams] = useSearchParams();
  const location = useLocation();
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

  const { data: myClaims = [] } = useMyClaims();
  const claimedKeys = useMemo(() => new Set(myClaims.map((c) => c.journey_key)), [myClaims]);

  const claimable = useMemo(
    () => journeys.filter((j) => j.journey_key && !claimedKeys.has(j.journey_key)),
    [journeys, claimedKeys]
  );

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

  const handleFile = async () => {
    if (!user || checked.size === 0) return;
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

  const loginNext = encodeURIComponent(location.pathname + location.search);

  return (
    <>
      <Link className="back-link" to="/regions/skanetrafiken/delay-alerts">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5" /><path d="m11 18-6-6 6-6" />
        </svg>
        Claimable delays
      </Link>

      <SkaneBand />

      <main className="app-shell">
        <header className="app-header">
          <div className="app-header__row">
            <div>
              <h1 className="app-header__title">Review &amp; claim</h1>
              <span className="skt-wordmark-line">Skånetrafiken · Skåne</span>
              <p className="app-header__sub">Late departures on your commute — check what you travelled, file in one go.</p>
            </div>
            <RegionUserMenu />
          </div>
        </header>

        {!authLoading && !user ? (
          <section className="app-card">
            <p style={{ marginBottom: 12 }}>Sign in to review and file these claims.</p>
            <Link to={`/login?next=${loginNext}`} className="btn-cmt btn-cmt--primary">Sign in</Link>
          </section>
        ) : journeyKeys.length === 0 ? (
          <div className="app-empty">No journeys to review — open this page from a digest email.</div>
        ) : isLoading ? (
          <div className="app-empty">Loading journeys…</div>
        ) : filedCount !== null ? (
          <section className="app-card">
            <p style={{ fontWeight: 600, marginBottom: 8 }}>✓ {filedCount} claim{filedCount === 1 ? "" : "s"} filed</p>
            <p style={{ marginBottom: 12 }}>Forms are generated automatically. Track status under Settings → My claims.</p>
            <Link to="/settings" className="btn-cmt btn-cmt--primary">Go to My claims</Link>
          </section>
        ) : (
          <>
            {claimProfile.missing.length > 0 && (
              <section className="app-card" style={{ borderColor: "var(--cmt-skt-red, #b91c1c)" }}>
                <p style={{ fontWeight: 600 }}>Your claim profile is incomplete</p>
                <p style={{ margin: "6px 0 12px" }}>
                  Missing: {claimProfile.missing.join(", ")}. Claims can't be filed until these are saved.
                </p>
                <Link to="/settings" className="btn-cmt btn-cmt--outline">Complete profile in Settings</Link>
              </section>
            )}

            <section className="app-card">
              <label style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 600, cursor: "pointer", marginBottom: 12 }}>
                <input type="checkbox" checked={allChecked} onChange={toggleAll} disabled={claimable.length === 0} />
                Select all ({claimable.length})
              </label>

              {journeys.map((j) => {
                const key = j.journey_key as string;
                const alreadyClaimed = claimedKeys.has(key);
                return (
                  <label
                    key={key}
                    style={{
                      display: "flex", alignItems: "center", gap: 12, padding: "10px 4px",
                      borderTop: "1px solid var(--border, #e5e7eb)",
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
                        {d(j.origin_scheduled)} · dep {t(j.origin_scheduled)} · arr {t(j.destination_scheduled)} → {t(j.destination_actual)}
                        {j.operator ? ` · ${j.operator}` : ""}
                      </div>
                    </div>
                    <div style={{ fontWeight: 700, whiteSpace: "nowrap" }}>
                      {j.canceled ? "Cancelled" : `+${Math.round(Number(j.destination_delay_minutes ?? 0))} min`}
                    </div>
                  </label>
                );
              })}

              {journeys.length === 0 && (
                <div className="app-empty">These journeys are no longer available to claim.</div>
              )}

              <div className="btn-row" style={{ marginTop: 16 }}>
                <button
                  type="button"
                  className="btn-cmt btn-cmt--primary"
                  onClick={() => void handleFile()}
                  disabled={submitting || checked.size === 0 || claimProfile.missing.length > 0}
                >
                  {submitting ? "Filing…" : `File ${checked.size} claim${checked.size === 1 ? "" : "s"}`}
                </button>
              </div>
              <p style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>
                By filing you confirm you took these journeys and authorise the use of your saved
                signature on the Skånetrafiken forms. False claims are reported to the police by
                Skånetrafiken.
              </p>
            </section>
          </>
        )}
      </main>
    </>
  );
}
