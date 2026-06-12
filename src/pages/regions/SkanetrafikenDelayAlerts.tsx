import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { SAMS_TO_GTFS } from "@/constants/stops";
import { useStations } from "@/hooks/useStations";
import { useJourneys, type Journey } from "@/hooks/useJourneys";
import { useStartClaim } from "@/hooks/useStartClaim";
import { useMyClaims } from "@/hooks/useMyClaims";
import { useAppShellStyles } from "@/hooks/useAppShellStyles";
import themeCSS from "@/themes/skanetrafiken/theme.css?inline";
import SkaneBand from "@/components/region/SkaneBand";
import RegionUserMenu from "@/components/region/RegionUserMenu";
import RegionDepartureCard, { type RegionDeparture } from "@/components/region/RegionDepartureCard";
import StationCombobox from "@/components/region/StationCombobox";

const CLAIM_START_URL = "https://www.skanetrafiken.se/kundservice/forseningsersattning/ansokan/";

const DEFAULT_FROM_STOP_ID = "1587"; // Malmö Triangeln
const DEFAULT_TO_STOP_ID = "25315";  // København H

const PAYOUT_LABELS: Record<string, string> = {
  bank: "Bank transfer",
  sms: "Värdekod via SMS",
  email: "Värdekod via e-post",
};

// Mirror of the delay tiers ticked on the Skånetrafiken form (see useStartClaim).
const delayTierLabel = (minutes: number | null | undefined, cancelled: boolean): string => {
  if (cancelled) return "Cancelled (full compensation)";
  const m = minutes ?? 0;
  if (m < 20) return "Under 20 min — not claimable";
  if (m < 40) return "20–39 min";
  if (m < 60) return "40–59 min";
  if (m < 120) return "60–119 min";
  return "120 min or more";
};

const STOCKHOLM_TIME_ZONE = "Europe/Stockholm";

const stockholmDateFormatter = new Intl.DateTimeFormat("sv-SE", {
  timeZone: STOCKHOLM_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const stockholmTimeFormatter = new Intl.DateTimeFormat("sv-SE", {
  timeZone: STOCKHOLM_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const toStockholmDate = (iso: string | null | undefined) => {
  if (!iso) return "";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso.split("T")[0] ?? "";
  return stockholmDateFormatter.format(parsed);
};

const toStockholmTime = (iso: string | null | undefined) => {
  if (!iso) return "";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso.split("T")[1]?.slice(0, 5) ?? "";
  return stockholmTimeFormatter.format(parsed);
};

const normalizeStopParam = (raw: string | null): string | null => {
  if (!raw) return null;
  return SAMS_TO_GTFS[raw] ?? raw;
};

const journeyToDeparture = (j: Journey): RegionDeparture => {
  const departureIso = j.origin_scheduled ?? "";
  const scheduledArrivalIso = j.destination_scheduled;
  const actualArrivalIso = j.destination_actual ?? j.destination_scheduled;
  return {
    line: j.line_name ?? (j.service_number ? `Tåg ${j.service_number}` : ""),
    lineName: j.line_terminus ?? "",
    operator: j.operator,
    departureStation: j.origin_stop_name ?? "",
    arrivalStation: j.destination_stop_name ?? "",
    departureTime: toStockholmTime(departureIso),
    departureRealtimeTime: toStockholmTime(j.origin_actual) || null,
    departureDate: toStockholmDate(departureIso),
    scheduledArrivalTime: scheduledArrivalIso ? toStockholmTime(scheduledArrivalIso) : null,
    arrivalTime: toStockholmTime(actualArrivalIso) || null,
    arrivalDate: toStockholmDate(actualArrivalIso) || null,
    arrivalDelayMinutes: j.destination_delay_minutes ?? 0,
    canceled: Boolean(j.canceled),
    journeyKey: j.journey_key ?? undefined,
  };
};

const dayDifference = (fromDate: string, toDate: string) => {
  const from = new Date(`${fromDate}T00:00:00`);
  const to = new Date(`${toDate}T00:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0;
  return Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
};

const formatDayShift = (diffDays: number) => {
  if (diffDays === 0) return "";
  if (diffDays === 1) return "next day";
  if (diffDays === -1) return "previous day";
  return diffDays > 0 ? `+${diffDays} days` : `${diffDays} days`;
};

const isClaimOutsideTicketValidity = (
  departureDate: string,
  isPeriodTicket?: boolean,
  ticketValidUntil?: string | null
) => {
  if (!isPeriodTicket || !ticketValidUntil) return false;
  return departureDate > ticketValidUntil.slice(0, 10);
};

export default function SkanetrafikenDelayAlerts() {
  useAppShellStyles(themeCSS);

  const [searchParams, setSearchParams] = useSearchParams();
  const routeFromParam = normalizeStopParam(searchParams.get("from"));
  const routeToParam = normalizeStopParam(searchParams.get("to"));
  // Mount-time presence decides whether profile preferences apply (see below) —
  // live params are always set once the sync effect has written them back.
  const hadRouteParamsOnMount = useRef(Boolean(routeFromParam || routeToParam)).current;
  const initialFromStopId =
    routeFromParam && routeFromParam !== routeToParam ? routeFromParam : DEFAULT_FROM_STOP_ID;
  const initialToStopId =
    routeToParam && routeToParam !== initialFromStopId ? routeToParam : DEFAULT_TO_STOP_ID;
  const [fromStopId, setFromStopId] = useState<string>(initialFromStopId);
  const [toStopId, setToStopId] = useState<string>(initialToStopId);

  // Keep the O-D choice in the URL so it survives switching between the
  // departures and delay-alerts views (their cross-links carry the params).
  useEffect(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("from", fromStopId);
        next.set("to", toStopId);
        return next;
      },
      { replace: true }
    );
  }, [fromStopId, toStopId, setSearchParams]);
  const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [selectedAlert, setSelectedAlert] = useState<RegionDeparture | null>(null);
  const [claimDialogOpen, setClaimDialogOpen] = useState(false);
  const [claimActionStatus, setClaimActionStatus] = useState("");
  const [sigPreviewUrl, setSigPreviewUrl] = useState<string | null>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { startClaim, pending: submitting } = useStartClaim();
  const queryClient = useQueryClient();

  const { data: stations = [] } = useStations();
  const stationOptions = useMemo(
    () =>
      stations
        .filter((s) => s.stop__id && s.station_name)
        .map((s) => ({ id: s.stop__id as string, name: s.station_name as string })),
    [stations]
  );

  const lookbackStart = useMemo(() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 90); // matches the 90 d claimable retention layer
    return d.toISOString().slice(0, 10);
  }, []);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const {
    data: journeys = [],
    isLoading: loading,
    dataUpdatedAt,
    refetch,
  } = useJourneys({
    fromStopId,
    toStopId,
    date: selectedDate, // always a specific date — no 60-day bulk fetch
    onlyClaimable: true,
  });

  // Look-up table so the dialog can recover the raw Journey row (carries
  // journey_key, stop IDs, scheduled timestamps) from the displayed RegionDeparture.
  const journeysByKey = useMemo(() => {
    const m = new Map<string, Journey>();
    for (const j of journeys) if (j.journey_key) m.set(j.journey_key, j);
    return m;
  }, [journeys]);

  // Everything from the saved profile that will be printed on the claim.
  // Missing entries mean an incomplete claim → Skånetrafiken can reject it.
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
    return { fields, missing };
  }, [profile]);

  // Fetch a short-lived signed URL for the signature preview when the dialog
  // opens, so the user sees the exact mark that will be stamped on the form.
  useEffect(() => {
    let active = true;
    const path = profile?.signature_path;
    if (!claimDialogOpen || !path) {
      setSigPreviewUrl(null);
      return;
    }
    supabase.storage
      .from("signatures")
      .createSignedUrl(path, 60 * 10)
      .then(({ data }) => {
        if (active) setSigPreviewUrl(data?.signedUrl ?? null);
      });
    return () => {
      active = false;
    };
  }, [claimDialogOpen, profile?.signature_path]);

  // Departures this user has already filed a claim for — proactive duplicate
  // guardrail (the DB unique constraint is the hard backstop). journey_key
  // identifies the trip+date+OD leg, so a Set of keys is enough to match.
  const { data: myClaims = [] } = useMyClaims(user?.id);
  const claimedKeys = useMemo(
    () => new Set(myClaims.map((c) => c.journey_key).filter(Boolean)),
    [myClaims]
  );

  const alerts = useMemo<RegionDeparture[]>(() => {
    const mapped = journeys.map(journeyToDeparture);
    const dedup = new Map<string, RegionDeparture>();
    for (const dep of mapped) {
      const key =
        dep.journeyKey ??
        [dep.line, dep.departureDate, dep.departureTime, dep.scheduledArrivalTime ?? ""].join("|");
      if (!dedup.has(key)) dedup.set(key, dep);
    }
    return Array.from(dedup.values()).sort((a, b) => {
      const aKey = `${a.departureDate}T${a.departureTime}`;
      const bKey = `${b.departureDate}T${b.departureTime}`;
      return bKey.localeCompare(aKey);
    });
  }, [journeys]);

  const fromStation = stationOptions.find((s) => s.id === fromStopId);
  const toStation = stationOptions.find((s) => s.id === toStopId);

  const handleFromChange = (value: string) => {
    setFromStopId(value);
    if (value === toStopId) {
      const fallback = stationOptions.find((s) => s.id !== value);
      if (fallback) setToStopId(fallback.id);
    }
  };

  const handleToChange = (value: string) => {
    setToStopId(value);
    if (value === fromStopId) {
      const fallback = stationOptions.find((s) => s.id !== value);
      if (fallback) setFromStopId(fallback.id);
    }
  };

  const handleReverseRoute = () => {
    setFromStopId(toStopId);
    setToStopId(fromStopId);
  };

  useEffect(() => {
    if (!profile) return;
    if (hadRouteParamsOnMount) return;
    if (profile.preferred_from_stop_id && profile.preferred_from_stop_id !== fromStopId) {
      setFromStopId(profile.preferred_from_stop_id);
    }
    if (profile.preferred_to_stop_id && profile.preferred_to_stop_id !== toStopId) {
      setToStopId(profile.preferred_to_stop_id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.preferred_from_stop_id, profile?.preferred_to_stop_id, hadRouteParamsOnMount]);

  const promptLoginForClaim = () => {
    toast({
      title: "Sign in required",
      description: "Please sign in with Google to start a claim.",
    });
    navigate(`/login?next=${encodeURIComponent("/regions/skanetrafiken/delay-alerts")}`);
  };

  const submitClaim = async (dep: RegionDeparture) => {
    if (!user) { promptLoginForClaim(); return; }
    const journey = dep.journeyKey ? journeysByKey.get(dep.journeyKey) : undefined;
    if (!journey) {
      setClaimActionStatus("Could not match this row to a journey. Refresh and try again.");
      return;
    }
    setClaimActionStatus("Submitting…");
    const result = await startClaim(journey, profile?.signature_path ?? null);
    if (result.ok) {
      setClaimActionStatus("");
      setClaimDialogOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["my-claims"] });
      toast({
        title: "Claim saved",
        description: "Your claim is queued. We'll generate the filled Skånetrafiken form for you.",
      });
    } else {
      setClaimActionStatus(result.error);
      toast({
        title: "Could not save claim",
        description: result.error,
        variant: "destructive",
      });
    }
  };

  const openManualClaimPage = () => {
    window.open(CLAIM_START_URL, "_blank", "noopener,noreferrer");
  };

  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt) : null;

  return (
    <>
      <Link className="back-link" to={`/regions/skanetrafiken?from=${fromStopId}&to=${toStopId}`}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5" /><path d="m11 18-6-6 6-6" />
        </svg>
        Back to departures
      </Link>

      <SkaneBand />

      <main className="app-shell">
        <header className="app-header">
          <div className="app-header__row">
            <div>
              <h1 className="app-header__title">Claimable Delays</h1>
              <span className="skt-wordmark-line">Skånetrafiken · Skåne</span>
              <p className="app-header__sub">
                Yellow: 20–39 min late · Orange: 40 min or more · Cancellations always claimable.
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <RegionUserMenu />
              <button
                type="button"
                className="icon-btn"
                onClick={() => void refetch()}
                disabled={loading}
                aria-label="Refresh"
              >
                <svg className={`icon ${loading ? "spin" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" />
                  <path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" />
                </svg>
              </button>
            </div>
          </div>
        </header>

        {/* Route + date card — identical structure to the departures page */}
        <section className="app-card">
          <div className="route-card__head">
            <svg className="train-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="3" width="16" height="16" rx="2" />
              <path d="M4 11h16" /><path d="M12 3v8" />
              <circle cx="8" cy="15.5" r="1" /><circle cx="16" cy="15.5" r="1" />
              <path d="m8 19-2 3" /><path d="m16 19 2 3" />
            </svg>
            <div className="meta">
              <div className="label">Route</div>
              <div className="value">{fromStation?.name ?? "—"} to {toStation?.name ?? "—"}</div>
            </div>
          </div>

          <div className="field-grid field-grid--3">
            <div className="field">
              <span className="field__label">From</span>
              <StationCombobox
                value={fromStopId}
                options={stationOptions.filter((s) => s.id !== toStopId)}
                onSelect={handleFromChange}
                ariaLabel="From station"
              />
            </div>
            <div className="field">
              <span className="field__label">To</span>
              <StationCombobox
                value={toStopId}
                options={stationOptions.filter((s) => s.id !== fromStopId)}
                onSelect={handleToChange}
                ariaLabel="To station"
              />
            </div>
            <div className="field">
              <span className="field__label">Date</span>
              <div className="date-field">
                <input
                  ref={dateInputRef}
                  type="date"
                  value={selectedDate}
                  min={lookbackStart}
                  max={today}
                  className="date-field__input"
                  onChange={(e) => setSelectedDate(e.target.value)}
                  aria-label="Filter by date"
                />
                <button
                  type="button"
                  className="date-field__trigger"
                  onClick={() => dateInputRef.current?.showPicker?.()}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <path d="M16 2v4M8 2v4M3 10h18" />
                  </svg>
                  {selectedDate}
                </button>
              </div>
            </div>
          </div>

          <div className="btn-row">
            <button type="button" className="btn-cmt btn-cmt--outline" onClick={handleReverseRoute} disabled={loading} style={{ minWidth: 144 }}>
              Reverse direction
            </button>
            <button type="button" className="btn-cmt btn-cmt--primary" onClick={() => void refetch()} disabled={loading} style={{ minWidth: 128 }}>
              Search route
            </button>
          </div>
        </section>

        {/* Hero CTA — same size and style as "Check Claimable Delays" on the departures page */}
        <div className="hero-cta-row">
          <Link to={`/regions/skanetrafiken?from=${fromStopId}&to=${toStopId}`} className="btn-cmt btn-cmt--primary btn-cmt--hero">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" /><path d="m11 18-6-6 6-6" />
            </svg>
            Back to departures
          </Link>
        </div>

        <div className="status">
          <div className="status__left">
            <div className="status__title">
              <svg className="clock" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" />
              </svg>
              <span>
                {lastUpdated ? `Last updated ${lastUpdated.toLocaleTimeString("sv-SE")}` : "Loading…"}
              </span>
            </div>
            <div className="status__sub">
              {alerts.length} claimable {alerts.length === 1 ? "journey" : "journeys"} on {selectedDate}.
            </div>
          </div>
        </div>

        <div>
          {alerts.length === 0 ? (
            <div className="app-empty">
              {loading
                ? "Loading delay alerts…"
                : `No claimable delays on ${selectedDate} for this route.`}
            </div>
          ) : (
            alerts.map((dep, idx) => {
              const previous = idx > 0 ? alerts[idx - 1] : null;
              const hasDateBoundary = !previous || previous.departureDate !== dep.departureDate;
              const key = dep.journeyKey ?? `${dep.line}-${dep.departureDate}-${dep.departureTime}-${idx}`;
              return (
                <div key={key}>
                  {hasDateBoundary && (
                    <div className="day-divider">
                      <div className="line" />
                      <div className="pill">{dep.departureDate || "—"}</div>
                      <div className="line" />
                    </div>
                  )}
                  <RegionDepartureCard
                    dep={dep}
                    action={
                      dep.journeyKey && claimedKeys.has(dep.journeyKey) ? (
                        <button
                          type="button"
                          className="btn-cmt btn-cmt--outline btn-cmt--sm"
                          disabled
                          title="You've already filed a claim for this departure"
                        >
                          ✓ Claim filed
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn-cmt btn-cmt--primary btn-cmt--sm"
                          onClick={() => {
                            if (!user) { promptLoginForClaim(); return; }
                            setSelectedAlert(dep);
                            setClaimActionStatus("");
                            setClaimDialogOpen(true);
                          }}
                        >
                          Start claim
                        </button>
                      )
                    }
                  />
                </div>
              );
            })
          )}
        </div>
      </main>

      <Dialog open={claimDialogOpen} onOpenChange={setClaimDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Claim Assistant</DialogTitle>
            <DialogDescription>
              Review everything that will go on your claim, then submit. We'll generate the filled form.
            </DialogDescription>
          </DialogHeader>

          {selectedAlert && (
            <div className="space-y-3">
              {(() => {
                const claimDate = selectedAlert.departureDate || "—";
                const arrivalDate = selectedAlert.arrivalDate || selectedAlert.departureDate || "—";
                const dayShift = formatDayShift(dayDifference(claimDate, arrivalDate));
                const hasDayShift = claimDate !== arrivalDate;
                return (
                  <>
                    {hasDayShift && (
                      <div className="cmt-dialog__warn">
                        Day change detected. Claim date: {claimDate} | Arrival date: {arrivalDate} ({dayShift})
                      </div>
                    )}
                    <div className="cmt-dialog__summary">
                      <p style={{ fontWeight: 700, marginBottom: 4 }}>Journey</p>
                      <p><b>Line:</b> {selectedAlert.line} {selectedAlert.lineName ?? ""}</p>
                      <p><b>Route:</b> {selectedAlert.departureStation} → {selectedAlert.arrivalStation}</p>
                      <p><b>Claim date:</b> {claimDate}</p>
                      <p><b>Arrival date:</b> {arrivalDate}{hasDayShift ? ` (${dayShift})` : ""}</p>
                      <p><b>Departs:</b> {selectedAlert.departureTime}</p>
                      <p><b>Scheduled arrival:</b> {selectedAlert.scheduledArrivalTime ?? "—"}</p>
                      <p><b>Actual arrival:</b> {selectedAlert.arrivalTime ?? "—"}</p>
                      <p><b>Delay:</b> +{selectedAlert.arrivalDelayMinutes ?? 0} min</p>
                      <p><b>Compensation tier:</b> {delayTierLabel(selectedAlert.arrivalDelayMinutes, selectedAlert.canceled)}</p>
                      {selectedAlert.canceled && (
                        <p style={{ color: "var(--cmt-skt-red)", fontWeight: 600 }}>Trip was cancelled.</p>
                      )}
                    </div>
                  </>
                );
              })()}

              <div className="cmt-dialog__summary">
                <p style={{ fontWeight: 700, marginBottom: 4 }}>Your details (from settings)</p>
                {claimProfile.fields.map((f) => (
                  <p key={f.label}>
                    <b>{f.label}:</b>{" "}
                    {f.value.trim() ? (
                      f.value
                    ) : (
                      <span style={{ color: "var(--cmt-skt-red)" }}>— missing —</span>
                    )}
                  </p>
                ))}
                {sigPreviewUrl && (
                  <div style={{ marginTop: 6 }}>
                    <p style={{ marginBottom: 2 }}>This signature will be affixed to the form:</p>
                    <img
                      src={sigPreviewUrl}
                      alt="Your signature"
                      style={{ height: 56, width: "auto", maxWidth: "100%", background: "#fff", borderRadius: 6, border: "1px solid var(--cmt-border, #ddd)", padding: 2 }}
                    />
                  </div>
                )}
              </div>

              {claimProfile.missing.length > 0 && (
                <div className="cmt-dialog__warn">
                  These required details are missing: {claimProfile.missing.join(", ")}. The claim
                  may be rejected without them.{" "}
                  <Link to="/settings" style={{ textDecoration: "underline", fontWeight: 600 }}>
                    Complete your settings
                  </Link>{" "}
                  first.
                </div>
              )}

              {isClaimOutsideTicketValidity(
                selectedAlert.departureDate,
                profile?.is_period_ticket,
                profile?.ticket_valid_until
              ) && (
                <div className="cmt-dialog__warn">
                  Warning: this claim date is outside your saved period ticket validity
                  ({profile?.ticket_valid_until}). Update in settings if needed.
                </div>
              )}

              <button
                type="button"
                className="btn-cmt btn-cmt--primary"
                style={{ width: "100%" }}
                disabled={submitting || claimProfile.missing.length > 0}
                onClick={() => void submitClaim(selectedAlert)}
              >
                {submitting ? "Submitting…" : "Confirm & submit claim"}
              </button>
              <button
                type="button"
                className="btn-cmt btn-cmt--outline"
                style={{ width: "100%" }}
                onClick={openManualClaimPage}
              >
                Or open manual form instead
              </button>
              {claimActionStatus && (
                <p style={{ fontSize: 12, color: "var(--cmt-muted)" }}>{claimActionStatus}</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
