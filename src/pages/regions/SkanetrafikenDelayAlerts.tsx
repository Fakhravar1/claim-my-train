import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useAppShellStyles } from "@/hooks/useAppShellStyles";
import themeCSS from "@/themes/skanetrafiken/theme.css?inline";
import SkaneBand from "@/components/region/SkaneBand";
import RegionUserMenu from "@/components/region/RegionUserMenu";
import RegionDepartureCard, { type RegionDeparture } from "@/components/region/RegionDepartureCard";

const CLAIM_START_URL = "https://www.skanetrafiken.se/kundservice/forseningsersattning/ansokan/";
const CLAIM_AUTOFILL_TEST_MODE = import.meta.env.VITE_CLAIM_AUTOFILL_TEST_MODE === "true";
const CLAIM_AUTOFILL_PROVIDER = import.meta.env.VITE_CLAIM_AUTOFILL_PROVIDER ?? "supabase";
const CLAIM_AUTOFILL_LOCAL_URL =
  (import.meta.env.VITE_CLAIM_AUTOFILL_LOCAL_URL as string | undefined) ?? "http://127.0.0.1:8787/claim";
const CLAIM_AUTOFILL_TEST_DATE = "2026-02-14";
const CLAIM_AUTOFILL_TEST_MOBILE = "0701234567";
const CLAIM_AUTOFILL_TEST_TICKET_ID = "2Y3CE88";

const DEFAULT_FROM_STOP_ID = "1587"; // Malmö Triangeln
const DEFAULT_TO_STOP_ID = "25315";  // København H

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
    line: j.route__name ?? "",
    lineName: j.line_terminus ?? "",
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

  const [searchParams] = useSearchParams();
  const routeFromParam = normalizeStopParam(searchParams.get("from"));
  const routeToParam = normalizeStopParam(searchParams.get("to"));
  const initialFromStopId =
    routeFromParam && routeFromParam !== routeToParam ? routeFromParam : DEFAULT_FROM_STOP_ID;
  const initialToStopId =
    routeToParam && routeToParam !== initialFromStopId ? routeToParam : DEFAULT_TO_STOP_ID;
  const [fromStopId, setFromStopId] = useState<string>(initialFromStopId);
  const [toStopId, setToStopId] = useState<string>(initialToStopId);
  const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [selectedAlert, setSelectedAlert] = useState<RegionDeparture | null>(null);
  const [claimDialogOpen, setClaimDialogOpen] = useState(false);
  const [claimActionStatus, setClaimActionStatus] = useState("");
  const dateInputRef = useRef<HTMLInputElement>(null);
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

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
    d.setUTCDate(d.getUTCDate() - 60);
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
    sinceDate: selectedDate, // always a specific date — no 60-day bulk fetch
    onlyClaimable: true,
  });

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
    const hasRouteParams = Boolean(routeFromParam || routeToParam);
    if (hasRouteParams) return;
    if (profile.preferred_from_stop_id && profile.preferred_from_stop_id !== fromStopId) {
      setFromStopId(profile.preferred_from_stop_id);
    }
    if (profile.preferred_to_stop_id && profile.preferred_to_stop_id !== toStopId) {
      setToStopId(profile.preferred_to_stop_id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.preferred_from_stop_id, profile?.preferred_to_stop_id, routeFromParam, routeToParam]);

  const promptLoginForClaim = () => {
    toast({
      title: "Sign in required",
      description: "Please sign in with Google to start a claim.",
    });
    navigate(`/login?next=${encodeURIComponent("/regions/skanetrafiken/delay-alerts")}`);
  };

  const openClaimFormWithFallback = async (dep: RegionDeparture) => {
    if (!user) { promptLoginForClaim(); return; }
    try {
      setClaimActionStatus("Trying autofill bot...");
      const requestBody = {
        departureDate: CLAIM_AUTOFILL_TEST_MODE ? CLAIM_AUTOFILL_TEST_DATE : dep.departureDate,
        departureTime: dep.departureTime,
        line: dep.line,
        lineName: dep.lineName ?? "",
        from: dep.departureStation,
        to: dep.arrivalStation,
        scheduledArrivalTime: dep.scheduledArrivalTime ?? null,
        actualArrivalTime: dep.arrivalTime ?? null,
        delayMinutes: dep.arrivalDelayMinutes ?? 0,
        mobileNumber: CLAIM_AUTOFILL_TEST_MODE ? CLAIM_AUTOFILL_TEST_MOBILE : (profile?.claim_mobile ?? null),
        ticketId: CLAIM_AUTOFILL_TEST_MODE ? CLAIM_AUTOFILL_TEST_TICKET_ID : (profile?.claim_ticket_id ?? null),
        personnummer: profile?.claim_personnummer ?? null,
        email: profile?.claim_email ?? user.email ?? null,
      };

      let result: { success?: boolean; message?: string };
      if (CLAIM_AUTOFILL_PROVIDER === "local") {
        const response = await fetch(CLAIM_AUTOFILL_LOCAL_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });
        const data = (await response.json()) as { success?: boolean; message?: string };
        if (!response.ok) throw new Error(data.message || `Local bot failed (${response.status})`);
        result = data;
      } else {
        const { data, error } = await supabase.functions.invoke("claim-assistant", { body: requestBody });
        if (error) throw error;
        result = (data ?? {}) as { success?: boolean; message?: string };
      }

      if (!result.success) throw new Error(result.message || "autofill bot failed");
      setClaimActionStatus(
        CLAIM_AUTOFILL_TEST_MODE
          ? "Autofill bot launched in test mode."
          : "Autofill bot launched. Continue on the opened claim page."
      );
    } catch {
      window.open(CLAIM_START_URL, "_blank", "noopener,noreferrer");
      setClaimActionStatus("Autofill unavailable. Opened manual claim page.");
    }
  };

  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt) : null;

  return (
    <>
      <Link className="back-link" to="/regions/skanetrafiken">
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
              <Select value={fromStopId} onValueChange={handleFromChange}>
                <SelectTrigger>
                  <SelectValue>{fromStation?.name ?? "Loading…"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {stationOptions.length === 0 ? (
                    <SelectItem value="__loading__" disabled>Loading stations…</SelectItem>
                  ) : (
                    stationOptions.filter((s) => s.id !== toStopId).map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="field">
              <span className="field__label">To</span>
              <Select value={toStopId} onValueChange={handleToChange}>
                <SelectTrigger>
                  <SelectValue>{toStation?.name ?? "Loading…"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {stationOptions.length === 0 ? (
                    <SelectItem value="__loading__" disabled>Loading stations…</SelectItem>
                  ) : (
                    stationOptions.filter((s) => s.id !== fromStopId).map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
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
          <Link to="/regions/skanetrafiken" className="btn-cmt btn-cmt--primary btn-cmt--hero">
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
              Review this delay summary, then continue to the official claim page.
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
                      <p><b>Line:</b> {selectedAlert.line} {selectedAlert.lineName ?? ""}</p>
                      <p><b>Route:</b> {selectedAlert.departureStation} → {selectedAlert.arrivalStation}</p>
                      <p><b>Claim date:</b> {claimDate}</p>
                      <p><b>Arrival date:</b> {arrivalDate}{hasDayShift ? ` (${dayShift})` : ""}</p>
                      <p><b>Departs:</b> {selectedAlert.departureTime}</p>
                      <p><b>Scheduled arrival:</b> {selectedAlert.scheduledArrivalTime ?? "—"}</p>
                      <p><b>Actual arrival:</b> {selectedAlert.arrivalTime ?? "—"}</p>
                      <p><b>Delay:</b> +{selectedAlert.arrivalDelayMinutes ?? 0} min</p>
                      {selectedAlert.canceled && (
                        <p style={{ color: "var(--cmt-skt-red)", fontWeight: 600 }}>Trip was cancelled.</p>
                      )}
                    </div>
                  </>
                );
              })()}

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
                onClick={() => void openClaimFormWithFallback(selectedAlert)}
              >
                Open claim form
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
