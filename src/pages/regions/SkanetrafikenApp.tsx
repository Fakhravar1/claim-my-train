import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { SAMS_TO_GTFS } from "@/constants/stops";
import { useStations } from "@/hooks/useStations";
import { useJourneys, type Journey } from "@/hooks/useJourneys";
import { useAppShellStyles } from "@/hooks/useAppShellStyles";
import themeCSS from "@/themes/skanetrafiken/theme.css?inline";
import SkaneBand from "@/components/region/SkaneBand";
import RegionUserMenu from "@/components/region/RegionUserMenu";
import RegionDepartureCard, { type RegionDeparture } from "@/components/region/RegionDepartureCard";

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
    line: j.line_name ?? (j.service_number ? `Tåg ${j.service_number}` : ""),
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

export default function SkanetrafikenApp() {
  useAppShellStyles(themeCSS);

  const { profile } = useAuth();
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
  const dateInputRef = useRef<HTMLInputElement>(null);

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
    date: selectedDate, // always a specific date — no 60-day bulk fetch
    onlyClaimable: false,
  });

  const departures = useMemo<RegionDeparture[]>(
    () => journeys.map(journeyToDeparture),
    [journeys]
  );

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

  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt) : null;

  return (
    <>
      <Link className="back-link" to="/">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5" /><path d="m11 18-6-6 6-6" />
        </svg>
        All regions
      </Link>

      <SkaneBand />

      <main className="app-shell">
        <header className="app-header">
          <div className="app-header__row">
            <div>
              <h1 className="app-header__title">Claim My Train</h1>
              <span className="skt-wordmark-line">Skånetrafiken · Skåne</span>
              <p className="app-header__sub">Find delayed departures and claim what you're owed.</p>
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

        {/* Route + date card */}
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
              {/* Hidden native date input; the visible button triggers it */}
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

        <div className="hero-cta-row">
          <Link to="/regions/skanetrafiken/delay-alerts" className="btn-cmt btn-cmt--primary btn-cmt--hero">
            Check Claimable Delays
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14" /><path d="m13 6 6 6-6 6" />
            </svg>
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
            <div className="status__sub">Times are shown in local Swedish time.</div>
            <div className="status__sub">Showing departures on {selectedDate}.</div>
          </div>
        </div>

        <div>
          {loading && departures.length === 0 ? (
            <div className="app-empty">Loading departures…</div>
          ) : departures.length === 0 ? (
            <div className="app-empty">No journeys found on {selectedDate} for this route.</div>
          ) : (
            departures.map((dep, index) => {
              const previous = index > 0 ? departures[index - 1] : null;
              const hasDateBoundary = !previous || previous.departureDate !== dep.departureDate;
              const key = dep.journeyKey ?? `${dep.line}-${dep.departureDate}-${dep.departureTime}-${index}`;
              return (
                <div key={key}>
                  {hasDateBoundary && (
                    <div className="day-divider">
                      <div className="line" />
                      <div className="pill">{dep.departureDate || "—"}</div>
                      <div className="line" />
                    </div>
                  )}
                  <RegionDepartureCard dep={dep} />
                </div>
              );
            })
          )}
        </div>
      </main>
    </>
  );
}
