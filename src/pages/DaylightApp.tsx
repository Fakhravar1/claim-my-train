import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useDaylightStyles } from "@/hooks/useDaylightStyles";
import { useNetworkBoard } from "@/hooks/useNetworkBoard";
import { useJourneys, type Journey } from "@/hooks/useJourneys";
import { useStations } from "@/hooks/useStations";
import { Nav, Hero, ValueProps, Footer } from "@/components/daylight/shell";
import { Board, lineLabel } from "@/components/daylight/Board";
import { ClaimModal, type ClaimInitial } from "@/components/daylight/ClaimModal";
import { EligibilityModal } from "@/components/daylight/EligibilityModal";

/**
 * Merged "Daylight" app page at `/` — the design handoff's single scroll page:
 * Nav → Hero → live network board → value props → Footer, plus the claim and
 * eligibility modals. Replaces the old marketing landing and the separate
 * region board pages (those routes still exist for digest deep-links).
 */
export default function DaylightApp() {
  useDaylightStyles();
  const navigate = useNavigate();
  const { user } = useAuth();

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const minDate = useMemo(() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 14); // v_journeys only reaches back ~raw retention
    return d.toISOString().slice(0, 10);
  }, []);

  const [date, setDate] = useState(today);
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [claim, setClaim] = useState<ClaimInitial | null>(null);
  const [info, setInfo] = useState<Journey | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  const { data: stations = [] } = useStations();
  const stationOptions = useMemo(
    () =>
      stations
        .filter((s) => s.stop__id && s.station_name)
        .map((s) => ({ id: s.stop__id as string, name: s.station_name as string })),
    [stations]
  );

  // Signed-in users can narrow the board to a specific route; otherwise it shows
  // a representative network-wide sample. Only one of the two queries is active.
  const routeMode = Boolean(user && from && to);
  const network = useNetworkBoard(date, !routeMode);
  const route = useJourneys({
    fromStopId: routeMode ? from : null,
    toStopId: routeMode ? to : null,
    date,
    onlyClaimable: false,
  });
  const allRows = routeMode ? route.data ?? [] : network.data ?? [];
  const isLoading = routeMode ? route.isLoading : network.isLoading;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allRows;
    return allRows.filter(
      (d) =>
        (d.origin_stop_name ?? "").toLowerCase().includes(q) ||
        (d.destination_stop_name ?? "").toLowerCase().includes(q) ||
        lineLabel(d).toLowerCase().includes(q)
    );
  }, [allRows, query]);

  const focusSearch = () => {
    boardRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    setTimeout(() => boardRef.current?.querySelector("input")?.focus(), 280);
  };

  const watchTrain = () => {
    setInfo(null);
    navigate(user ? "/settings" : "/login?next=/settings");
  };

  return (
    <div className="cmt-daylight">
      <Nav onLogin={() => setClaim({ blank: true, loginOnly: true })} />
      <Hero onUnknown={() => setClaim({ blank: true })} onSearch={focusSearch} />
      <Board
        ref={boardRef}
        rows={rows}
        loading={isLoading}
        query={query}
        setQuery={setQuery}
        date={date}
        setDate={setDate}
        minDate={minDate}
        maxDate={today}
        showRoute={Boolean(user)}
        from={from}
        to={to}
        setFrom={setFrom}
        setTo={setTo}
        stationOptions={stationOptions}
        onClaim={(d) => setClaim(d)}
        onInfo={(d) => setInfo(d)}
        onUnknown={() => setClaim({ blank: true })}
      />
      <ValueProps
        onUnknown={() => setClaim({ blank: true })}
        onSearch={focusSearch}
        onHabits={() => setClaim({ blank: true, loginOnly: true })}
      />
      <Footer />

      {claim && <ClaimModal initial={claim} onClose={() => setClaim(null)} />}
      {info && <EligibilityModal dep={info} onClose={() => setInfo(null)} onWatch={watchTrain} />}
    </div>
  );
}
