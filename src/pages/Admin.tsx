import { useMemo } from "react";
import { Navigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useDaylightStyles } from "@/hooks/useDaylightStyles";
import { supabase } from "@/integrations/supabase/client";
import { Nav, Footer } from "@/components/daylight/shell";
import { ADMIN_USER_ID } from "@/lib/admin";

type EventRow = {
  resend_email_id: string | null;
  event_type: string;
  frequency: string | null;
  created_at: string;
};

const pct = (num: number, den: number) => (den > 0 ? `${Math.round((num / den) * 100)}%` : "—");

// Distinct email ids per event type → an email counts once even if Resend sends
// several opens/clicks for it.
function rollup(rows: EventRow[]) {
  const ids: Record<string, Set<string>> = {};
  for (const r of rows) {
    if (!r.resend_email_id) continue;
    (ids[r.event_type] ??= new Set()).add(r.resend_email_id);
  }
  const n = (t: string) => ids[t]?.size ?? 0;
  const delivered = n("delivered");
  return {
    delivered,
    opened: n("opened"),
    clicked: n("clicked"),
    bounced: n("bounced"),
    openRate: pct(n("opened"), delivered),
    clickRate: pct(n("clicked"), delivered),
    clickToOpen: pct(n("clicked"), n("opened")),
  };
}

export default function Admin() {
  useDaylightStyles();
  const { user, profile, loading: authLoading, signOut, signInWithGoogle } = useAuth();

  const { data: rows = [], isLoading } = useQuery<EventRow[]>({
    queryKey: ["digest-events"],
    enabled: user?.id === ADMIN_USER_ID,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("digest_events")
        .select("resend_email_id, event_type, frequency, created_at")
        .order("created_at", { ascending: false })
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as EventRow[];
    },
  });

  const overall = useMemo(() => rollup(rows), [rows]);
  const daily = useMemo(() => rollup(rows.filter((r) => r.frequency === "daily")), [rows]);
  const weekly = useMemo(() => rollup(rows.filter((r) => r.frequency === "weekly")), [rows]);
  const recent = rows.slice(0, 15);

  // Gate: only the owner. Wait for auth, then bounce everyone else home.
  if (authLoading) return null;
  if (!user || user.id !== ADMIN_USER_ID) return <Navigate to="/" replace />;

  const accountLabel = profile?.full_name || profile?.first_name || user.email || "Konto";

  return (
    <div className="cmt-daylight">
      <Helmet>
        <title>Digest-statistik — Qvitta</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      <Nav
        signedIn
        accountLabel={accountLabel}
        onSignOut={() => void signOut()}
        onLogin={() => void signInWithGoogle("/admin")}
      />

      <main className="wrap" style={{ paddingTop: "2rem", paddingBottom: "4rem", maxWidth: 820 }}>
        <h1 style={{ fontSize: "1.6rem", margin: "0 0 .25rem" }}>Digest-statistik</h1>
        <p className="muted" style={{ margin: "0 0 1.5rem" }}>
          Leverans, öppningar och klick för aviseringsmejlen (alla användare). Intern vy.
        </p>

        {isLoading ? (
          <div className="board"><p className="muted">Laddar…</p></div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: 16 }}>
              <Stat label="Levererade" value={overall.delivered} />
              <Stat label="Öppningsgrad" value={overall.openRate} sub={`${overall.opened} öppnade`} />
              <Stat label="Klickgrad" value={overall.clickRate} sub={`${overall.clicked} klickade`} />
              <Stat label="Klick / öppning" value={overall.clickToOpen} />
              <Stat label="Studsar" value={overall.bounced} />
            </div>

            <div className="board" style={{ marginBottom: 16 }}>
              <h2 style={{ fontSize: "1rem", margin: "0 0 10px" }}>Per frekvens</h2>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ textAlign: "left", opacity: 0.6 }}>
                    <th style={{ padding: "6px 0" }}>Frekvens</th>
                    <th>Levererade</th><th>Öppningsgrad</th><th>Klickgrad</th>
                  </tr>
                </thead>
                <tbody>
                  <FreqRow label="Dagligen" m={daily} />
                  <FreqRow label="Veckovis" m={weekly} />
                </tbody>
              </table>
            </div>

            <div className="board">
              <h2 style={{ fontSize: "1rem", margin: "0 0 10px" }}>Senaste händelser</h2>
              {recent.length === 0 ? (
                <p className="muted">Inga händelser än.</p>
              ) : (
                recent.map((r, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderTop: i ? "1px solid var(--board-line)" : "none", fontSize: 13 }}>
                    <span><b>{r.event_type}</b>{r.frequency ? ` · ${r.frequency}` : ""}</span>
                    <span className="muted">{new Date(r.created_at).toLocaleString("sv-SE")}</span>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="board" style={{ padding: "14px 16px" }}>
      <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em", opacity: 0.6 }}>{label}</div>
      <div style={{ fontSize: "1.7rem", fontWeight: 700, marginTop: 4 }}>{value}</div>
      {sub && <div className="muted" style={{ fontSize: 12 }}>{sub}</div>}
    </div>
  );
}

function FreqRow({ label, m }: { label: string; m: ReturnType<typeof rollup> }) {
  return (
    <tr style={{ borderTop: "1px solid var(--board-line)" }}>
      <td style={{ padding: "8px 0", fontWeight: 600 }}>{label}</td>
      <td>{m.delivered}</td>
      <td>{m.openRate}</td>
      <td>{m.clickRate}</td>
    </tr>
  );
}
