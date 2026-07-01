import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useDaylightStyles } from "@/hooks/useDaylightStyles";
import { supabase } from "@/integrations/supabase/client";
import { type Journey } from "@/hooks/useJourneys";
import { buildClaimPayload } from "@/hooks/useStartClaim";
import { useMyClaims } from "@/hooks/useMyClaims";
import { useCommuteRoutes } from "@/hooks/useCommuteRoutes";
import { useMyDelays } from "@/hooks/useMyDelays";
import { isSupportedPurchasingOperator, purchasingOperatorLabel, purchasingOperatorClaimUrl } from "@/lib/claimProfileValidation";
import { Nav, Footer } from "@/components/daylight/shell";
import { SjClaimModal } from "@/components/daylight/SjClaimModal";

const PAYOUT_LABELS: Record<string, string> = {
  bank: "Bankkonto",
  sms: "Värdekod via SMS",
  email: "Värdekod via e-post",
};

const STOCKHOLM_TIME_ZONE = "Europe/Stockholm";
const fmtTime = new Intl.DateTimeFormat("sv-SE", {
  timeZone: STOCKHOLM_TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: false,
});
const fmtDate = new Intl.DateTimeFormat("sv-SE", {
  timeZone: STOCKHOLM_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
});
const fmtDayHeader = new Intl.DateTimeFormat("sv-SE", {
  timeZone: STOCKHOLM_TIME_ZONE, weekday: "long", year: "numeric", month: "long", day: "numeric",
});
const t = (iso: string | null | undefined) => (iso ? fmtTime.format(new Date(iso)) : "—");
const d = (iso: string | null | undefined) => (iso ? fmtDate.format(new Date(iso)) : "—");

/**
 * "Mina förseningar" — the signed-in user's standing list of claimable delays on
 * their monitored commute routes (a persistent version of the digest email,
 * §16). Same snapshot/consent/bulk-file path as /claim-review and the single
 * claim dialog (`buildClaimPayload`). Daylight-themed.
 */
export default function MyDelays() {
  useDaylightStyles();

  const { user, profile, loading: authLoading, signOut, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: routes = [], isLoading: routesLoading } = useCommuteRoutes(user?.id);
  const { data: journeys = [], isLoading: delaysLoading } = useMyDelays(user?.id, routes);
  const { data: myClaims = [] } = useMyClaims(user?.id);
  const claimedKeys = useMemo(() => new Set(myClaims.map((c) => c.journey_key)), [myClaims]);

  const claimable = useMemo(
    () => journeys.filter((j) => j.journey_key && !claimedKeys.has(j.journey_key)),
    [journeys, claimedKeys]
  );

  // Group by Stockholm travel day (journeys arrive newest-first).
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
  const [submitting, setSubmitting] = useState(false);
  const [filedCount, setFiledCount] = useState<number | null>(null);

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

  // Same completeness rule as the single-claim dialog (CLAUDE.md §6).
  const claimProfile = useMemo(() => {
    const fields: { label: string; value: string }[] = [
      { label: "Namn", value: [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") },
      { label: "Personnummer", value: profile?.claim_personnummer ?? "" },
      {
        label: "Adress",
        value: [profile?.street_address, [profile?.postal_code, profile?.city].filter(Boolean).join(" ")]
          .filter(Boolean)
          .join(", "),
      },
      { label: "Mobil", value: profile?.claim_mobile ?? "" },
      { label: "E-post", value: profile?.claim_email ?? "" },
      { label: "Biljett-ID", value: profile?.claim_ticket_id ?? "" },
      {
        label: "Utbetalning",
        value: profile?.payout_method ? PAYOUT_LABELS[profile.payout_method] ?? profile.payout_method : "",
      },
      { label: "Signatur", value: profile?.signature_path ? "Sparad" : "" },
    ];
    const missing = fields.filter((f) => !f.value.trim()).map((f) => f.label);
    return { missing };
  }, [profile]);

  const operatorSupported = isSupportedPurchasingOperator(profile?.purchasing_operator);
  const externalClaimUrl = purchasingOperatorClaimUrl(profile?.purchasing_operator);
  // SJ files one booking at a time (each trip has its own booking number), so it
  // doesn't use the Skånetrafiken bulk/checkbox flow — every row gets its own
  // "Ansök" that opens the SJ pop-up. SJ IS handled, just not via the bulk path.
  const isSj = profile?.purchasing_operator === "sj";
  const [sjJourney, setSjJourney] = useState<Journey | null>(null);

  const handleFile = async () => {
    if (!user || checked.size === 0 || !operatorSupported) return;
    setSubmitting(true);
    try {
      const rows = claimable
        .filter((j) => checked.has(j.journey_key as string))
        // Snapshot the user's attested operator; booking_reference stays null here
        // (bulk SJ filing isn't wired yet — and SJ is still guardrail-blocked).
        .map((j) => buildClaimPayload(j, user.id, profile?.signature_path ?? null, profile?.purchasing_operator ?? null));
      const { error } = await supabase
        .from("claims")
        .upsert(rows, { onConflict: "user_id,journey_key,trip_start_date", ignoreDuplicates: true });
      if (error) {
        toast({ title: "Ansökan misslyckades", description: error.message, variant: "destructive" });
        return;
      }
      setFiledCount(rows.length);
      queryClient.invalidateQueries({ queryKey: ["my-claims"] });
      toast({ title: `Ansökte om ${rows.length} ersättning${rows.length === 1 ? "" : "ar"}`, description: "Vi genererar blanketterna — följ status under Inställningar → Mina ansökningar." });
    } finally {
      setSubmitting(false);
    }
  };

  const loginNext = location.pathname + location.search;
  const accountLabel = profile?.full_name || profile?.first_name || user?.email || "Konto";
  const loading = authLoading || routesLoading || delaysLoading;

  return (
    <div className="cmt-daylight">
      <Helmet>
        <title>Mina förseningar — Qvitta</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      <Nav
        signedIn={Boolean(user)}
        accountLabel={accountLabel}
        onSignOut={() => void signOut()}
        onLogin={() => void signInWithGoogle(loginNext)}
      />

      <main className="wrap" style={{ paddingTop: "2rem", paddingBottom: "4rem", maxWidth: 720 }}>
        <h1 style={{ fontSize: "1.6rem", margin: "0 0 .25rem" }}>Mina förseningar</h1>
        <p className="muted" style={{ margin: "0 0 1.5rem" }}>
          Ersättningsbara förseningar och inställda tåg på dina bevakade sträckor — bocka för det du reste och ansök.
        </p>

        {!authLoading && !user ? (
          <div className="board">
            <p style={{ marginBottom: 12 }}>Logga in för att se dina förseningar.</p>
            <button type="button" className="btn btn--dark" onClick={() => void signInWithGoogle(loginNext)}>
              Logga in
            </button>
          </div>
        ) : loading ? (
          <div className="board"><p className="muted">Laddar…</p></div>
        ) : routes.length === 0 ? (
          <div className="board">
            <p style={{ fontWeight: 600, marginBottom: 6 }}>Du har inga bevakade sträckor än</p>
            <p style={{ marginBottom: 12 }}>
              Lägg till din pendlarsträcka under Inställningar → Pendlarvanor, så samlar vi förseningar
              du kan ansöka om här.
            </p>
            <button type="button" className="btn btn--accent" onClick={() => navigate("/settings")}>
              Ställ in pendlarvanor
            </button>
          </div>
        ) : filedCount !== null ? (
          <div className="board">
            <p style={{ fontWeight: 600, marginBottom: 8 }}>✓ {filedCount} ansökning{filedCount === 1 ? "" : "ar"} inskickade</p>
            <p style={{ marginBottom: 12 }}>Blanketterna fylls i automatiskt. Följ status under Inställningar → Mina ansökningar.</p>
            <button type="button" className="btn btn--accent" onClick={() => navigate("/settings")}>Till Mina ansökningar</button>
          </div>
        ) : claimable.length === 0 ? (
          <div className="board">
            <p style={{ fontWeight: 600, marginBottom: 6 }}>Inga oansökta förseningar just nu</p>
            <p className="muted">
              Vi bevakar dina sträckor och visar nya ersättningsbara förseningar här (och mejlar om din digest är på).
            </p>
          </div>
        ) : (
          <>
            {!isSj && claimProfile.missing.length > 0 && (
              <div className="board" style={{ marginBottom: 16, borderColor: "var(--severe)" }}>
                <p style={{ fontWeight: 600 }}>Din ansökningsprofil är ofullständig</p>
                <p style={{ margin: "6px 0 12px" }}>
                  Saknas: {claimProfile.missing.join(", ")}. Ansökningar kan inte skickas in förrän dessa är sparade.
                </p>
                <button type="button" className="btn btn--ghost" onClick={() => navigate("/settings")}>Komplettera i Inställningar</button>
              </div>
            )}

            {!operatorSupported && externalClaimUrl && (
              <div className="board" style={{ marginBottom: 16 }}>
                <p style={{ fontWeight: 600 }}>{purchasingOperatorLabel(profile?.purchasing_operator)} hanterar ersättning på sin egen sida</p>
                <p style={{ margin: "6px 0 12px" }}>
                  Vi listar dina förseningar här, men själva ansökan görs hos {purchasingOperatorLabel(profile?.purchasing_operator)}.
                </p>
                <a className="btn btn--accent" href={externalClaimUrl} target="_blank" rel="noopener noreferrer">
                  Öppna {purchasingOperatorLabel(profile?.purchasing_operator)}:s formulär ↗
                </a>
              </div>
            )}

            {!operatorSupported && !externalClaimUrl && !isSj && (
              <div className="board" style={{ marginBottom: 16, borderColor: "var(--severe)" }}>
                <p style={{ fontWeight: 600 }}>Bulkansökan stöds inte för den här operatören</p>
                <p style={{ margin: "6px 0 12px" }}>
                  {profile?.purchasing_operator
                    ? `Du valde ${purchasingOperatorLabel(profile.purchasing_operator)} som biljettleverantör. Ansök en resa i taget från tavlan på startsidan — vi vägleder dig till rätt formulär.`
                    : "Ange var du köpte din biljett först under Inställningar."}
                </p>
                <button type="button" className="btn btn--ghost" onClick={() => navigate("/settings")}>Uppdatera biljettleverantör</button>
              </div>
            )}

            {isSj && (
              <div className="board" style={{ marginBottom: 16 }}>
                <p style={{ fontWeight: 600 }}>SJ-ansökningar görs en resa i taget</p>
                <p style={{ margin: "6px 0 0" }}>
                  Varje SJ-bokning har ett eget boknings-/biljettnummer, så du ansöker per resa nedan —
                  vi fyller i SJ:s formulär åt dig.
                </p>
              </div>
            )}

            <div className="board">
              {!isSj && (
                <>
                  <div style={{ marginBottom: 12 }}>
                    <button
                      type="button"
                      className="btn btn--accent"
                      onClick={() => void handleFile()}
                      disabled={submitting || checked.size === 0 || claimProfile.missing.length > 0 || !operatorSupported}
                    >
                      {submitting ? "Skickar…" : `Ansök om ${checked.size} ersättning${checked.size === 1 ? "" : "ar"}`}
                    </button>
                    <p style={{ fontSize: 12, opacity: 0.7, marginTop: 8, marginBottom: 0 }}>
                      Genom att ansöka intygar du att du reste på dessa avgångar och godkänner att din
                      sparade underskrift används på ansökningsformuläret. Falska ansökningar kan
                      polisanmälas av operatören.
                    </p>
                  </div>

                  <label style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 600, cursor: "pointer", padding: "12px 0", borderTop: "1px solid var(--board-line)" }}>
                    <input type="checkbox" checked={allChecked} onChange={toggleAll} disabled={claimable.length === 0} />
                    Markera alla ({claimable.length})
                  </label>
                </>
              )}

              {groupedByDay.map((group, groupIndex) => {
                const groupClaimable = group.items.filter(
                  (j) => j.journey_key && !claimedKeys.has(j.journey_key as string)
                ).length;
                return (
                <details
                  key={group.label}
                  className="day__group"
                  open={groupIndex === 0}
                  style={{ borderTop: "1px solid var(--board-line)" }}
                >
                  <summary
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      fontSize: 12, fontWeight: 700, textTransform: "uppercase",
                      letterSpacing: "0.04em", opacity: 0.75,
                      padding: "14px 0", cursor: "pointer",
                    }}
                  >
                    <svg className="day__chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                    <span>{group.label}</span>
                    <span style={{ marginLeft: "auto", opacity: 0.7 }}>
                      {group.items.length} försening{group.items.length === 1 ? "" : "ar"}
                      {groupClaimable > 0 ? ` · ${groupClaimable} att ansöka` : ""}
                    </span>
                  </summary>
                  {group.items.map((j) => {
                    const key = j.journey_key as string;
                    const alreadyClaimed = claimedKeys.has(key);
                    const rowInner = (
                      <>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600 }}>
                            {j.origin_stop_name} → {j.destination_stop_name}
                          </div>
                          <div style={{ fontSize: 13, opacity: 0.8 }}>
                            avg {t(j.origin_scheduled)} · ank {t(j.destination_scheduled)} → {t(j.destination_actual)}
                            {j.operator ? ` · ${j.operator}` : ""}
                          </div>
                        </div>
                        <span className={`tag ${j.canceled ? "tag--cancelled" : "tag--eligible"}`}>
                          {alreadyClaimed ? "Ansökt" : j.canceled ? "Inställt" : `+${Math.round(Number(j.destination_delay_minutes ?? 0))} min`}
                        </span>
                      </>
                    );
                    if (isSj) {
                      return (
                        <div
                          key={key}
                          style={{
                            display: "flex", alignItems: "center", gap: 12, padding: "10px 0",
                            opacity: alreadyClaimed ? 0.55 : 1,
                          }}
                        >
                          {rowInner}
                          {!alreadyClaimed && (
                            <button type="button" className="btn btn--accent btn--sm" onClick={() => setSjJourney(j)}>
                              Ansök
                            </button>
                          )}
                        </div>
                      );
                    }
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
                        {rowInner}
                      </label>
                    );
                  })}
                </details>
                );
              })}
            </div>
          </>
        )}
      </main>

      {sjJourney && <SjClaimModal journey={sjJourney} onClose={() => setSjJourney(null)} />}

      <Footer />
    </div>
  );
}
