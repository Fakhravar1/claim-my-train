import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { SAMS_TO_GTFS } from "@/constants/stops";
import { useStations } from "@/hooks/useStations";
import { useJourneys, type Journey } from "@/hooks/useJourneys";
import { useMyClaims } from "@/hooks/useMyClaims";
import { useDaylightStyles } from "@/hooks/useDaylightStyles";
import { Nav, Footer } from "@/components/daylight/shell";
import { ClaimModal, type ClaimInitial } from "@/components/daylight/ClaimModal";
import { WatchModal } from "@/components/daylight/WatchModal";
import { lineLabel } from "@/components/daylight/Board";
import { ArrowIcon, BellIcon, CheckIcon } from "@/components/daylight/icons";
import { statusMeta } from "@/lib/daylightStatus";

const DEFAULT_FROM_STOP_ID = "1587"; // Malmö Triangeln
const DEFAULT_TO_STOP_ID = "25315"; // København H

const STOCKHOLM_TIME_ZONE = "Europe/Stockholm";

const fmtTime = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleTimeString("sv-SE", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: STOCKHOLM_TIME_ZONE,
      })
    : "—";

const fmtDayLong = (iso: string | null | undefined) =>
  iso
    ? new Date(iso + "T00:00:00").toLocaleDateString("sv-SE", {
        weekday: "long",
        day: "numeric",
        month: "long",
      })
    : "—";

const normalizeStopParam = (raw: string | null): string | null => {
  if (!raw) return null;
  return SAMS_TO_GTFS[raw] ?? raw;
};

export default function SkanetrafikenDelayAlerts() {
  useDaylightStyles();

  const { user, profile, signOut, signInWithGoogle } = useAuth();

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

  // Keep the O-D choice in the URL so it survives switching between views
  // (the digest deep-links and cross-links carry these params).
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
  const [claim, setClaim] = useState<ClaimInitial | null>(null);
  const [watch, setWatch] = useState<Journey | null>(null);

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
  } = useJourneys({
    fromStopId,
    toStopId,
    date: selectedDate,
    onlyClaimable: true,
  });

  // Departures this user has already filed a claim for — proactive duplicate
  // guardrail (the DB unique constraint is the hard backstop).
  const { data: myClaims = [] } = useMyClaims(user?.id);
  const claimedKeys = useMemo(
    () => new Set(myClaims.map((c) => c.journey_key).filter(Boolean)),
    [myClaims]
  );

  // Dedup + newest-first, then group by Stockholm travel day for the dividers.
  const alerts = useMemo(() => {
    const dedup = new Map<string, Journey>();
    for (const j of journeys) {
      const key = j.journey_key ?? `${j.service_number}|${j.origin_scheduled}`;
      if (!dedup.has(key)) dedup.set(key, j);
    }
    return Array.from(dedup.values()).sort((a, b) =>
      (b.origin_scheduled ?? "").localeCompare(a.origin_scheduled ?? "")
    );
  }, [journeys]);

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
  const reverseRoute = () => {
    setFromStopId(toStopId);
    setToStopId(fromStopId);
  };

  // Apply saved preferred route only when the URL didn't already carry one.
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

  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt) : null;

  return (
    <div className="cmt-daylight">
      <Nav
        signedIn={Boolean(user)}
        accountLabel={profile?.full_name || profile?.first_name || user?.email || "Konto"}
        onSignOut={() => void signOut()}
        onLogin={() => void signInWithGoogle("/regions/skanetrafiken/delay-alerts")}
      />

      <header className="hero">
        <div className="hero__glow" aria-hidden="true" />
        <div className="wrap">
          <p className="eyebrow">Skånetrafiken · Skåne</p>
          <h1>Dina ersättningsbara förseningar</h1>
          <p className="hero__lead">
            Avgångar på din sträcka som var 20 minuter eller mer sena — eller inställda. Välj sträcka
            och datum, granska resan och ansök direkt på skärmen.
          </p>
        </div>
      </header>

      <section className="board-wrap" id="board">
        <div className="wrap">
          <div className="board">
            <div className="board__head">
              <div className="board__title">
                <span className="live">
                  <span className="live__dot" />LIVE
                </span>
                <span className="board__h">Ersättningsbara förseningar</span>
              </div>
            </div>

            <div className="board__controls">
              <label className="board__control">
                <span>Från</span>
                <select value={fromStopId} onChange={(e) => handleFromChange(e.target.value)}>
                  {stationOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="board__control">
                <span>Till</span>
                <select value={toStopId} onChange={(e) => handleToChange(e.target.value)}>
                  {stationOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="board__control">
                <span>Datum</span>
                <input
                  type="date"
                  value={selectedDate}
                  min={lookbackStart}
                  max={today}
                  onChange={(e) => setSelectedDate(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                style={{ alignSelf: "flex-end" }}
                onClick={reverseRoute}
              >
                Byt riktning
              </button>
            </div>

            <div className="board__sub">
              <span>
                {alerts.length} {alerts.length === 1 ? "ersättningsbar resa" : "ersättningsbara resor"}
              </span>
              <span>
                {lastUpdated
                  ? `Uppdaterad ${lastUpdated.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}`
                  : "Hämtar…"}
              </span>
            </div>

            <div className="rows">
              {loading && <div className="empty">Hämtar förseningar…</div>}
              {!loading && alerts.length === 0 && (
                <div className="empty">Inga ersättningsbara förseningar på {selectedDate} för den här sträckan.</div>
              )}
              {!loading &&
                alerts.map((j, idx) => {
                  const prev = idx > 0 ? alerts[idx - 1] : null;
                  const newDay = !prev || prev.origin_local_date !== j.origin_local_date;
                  return (
                    <div key={j.journey_key ?? `${j.service_number}-${j.origin_scheduled}-${idx}`}>
                      {newDay && (
                        <div
                          className="row__date"
                          style={{ padding: "0.9rem 0 0.1rem", fontSize: ".68rem" }}
                        >
                          {fmtDayLong(j.origin_local_date)}
                        </div>
                      )}
                      <AlertRow
                        j={j}
                        claimed={Boolean(j.journey_key && claimedKeys.has(j.journey_key))}
                        onClaim={() => setClaim(j)}
                        onWatch={() =>
                          user ? setWatch(j) : void signInWithGoogle("/regions/skanetrafiken/delay-alerts")
                        }
                      />
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      </section>

      <Footer />

      {claim && (
        <ClaimModal initial={claim} onClose={() => setClaim(null)} />
      )}
      {watch && <WatchModal journey={watch} onClose={() => setWatch(null)} />}
    </div>
  );
}

function AlertRow({
  j,
  claimed,
  onClaim,
  onWatch,
}: {
  j: Journey;
  claimed: boolean;
  onClaim: () => void;
  onWatch: () => void;
}) {
  const m = statusMeta(j.destination_delay_minutes, Boolean(j.canceled));
  return (
    <div className={"row row--" + m.tone}>
      <div className="row__time">
        <span className="row__dep">{fmtTime(j.origin_scheduled)}</span>
        <span className="row__date">{fmtTime(j.destination_actual ?? j.destination_scheduled)}</span>
      </div>
      <div className="row__route">
        <div className="row__stations">
          <span className="st st--from">{j.origin_stop_name}</span>
          <span className="st__arrow">
            <ArrowIcon width={15} height={15} />
          </span>
          <span className="st st--to">{j.destination_stop_name}</span>
        </div>
        <span className="row__line">{lineLabel(j)}</span>
      </div>
      <div className="row__status">
        <span className={"tag tag--" + m.tone}>{m.chipLabel}</span>
      </div>
      <div className="row__action">
        {claimed ? (
          <button
            type="button"
            className="btn btn--quiet btn--sm"
            disabled
            title="Du har redan ansökt om den här avgången"
          >
            <CheckIcon width={15} height={15} /> Ansökt
          </button>
        ) : (
          <button type="button" className="btn btn--accent btn--sm" onClick={onClaim}>
            Ansök om ersättning
          </button>
        )}
        <button
          type="button"
          className="watchbtn"
          onClick={onWatch}
          aria-label="Bevaka åt mig"
          title="Bevaka åt mig"
        >
          <BellIcon width={16} height={16} />
        </button>
      </div>
    </div>
  );
}
