import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useAuth } from "@/contexts/AuthContext";
import { useDaylightStyles } from "@/hooks/useDaylightStyles";
import { useNetworkBoard, useStationBoard } from "@/hooks/useNetworkBoard";
import { useJourneys, type Journey } from "@/hooks/useJourneys";
import type { WatchTarget } from "@/components/daylight/WatchModal";
import { useStations } from "@/hooks/useStations";
import { Nav, Hero, ValueProps, Footer } from "@/components/daylight/shell";
import { Board } from "@/components/daylight/Board";
import { ClaimModal, type ClaimInitial } from "@/components/daylight/ClaimModal";
import { EligibilityModal } from "@/components/daylight/EligibilityModal";
import { WatchModal } from "@/components/daylight/WatchModal";
import { usePendingClaimCompletion } from "@/hooks/usePendingClaimCompletion";

/**
 * Merged "Daylight" app page at `/` — the design handoff's single scroll page:
 * Nav → Hero → live network board → value props → Footer, plus the claim and
 * eligibility modals. Replaces the old marketing landing and the separate
 * region board pages (those routes still exist for digest deep-links).
 */
export default function DaylightApp() {
  useDaylightStyles();
  usePendingClaimCompletion(); // finish a deferred claim after email verification
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();

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
  const [onlyDelayed, setOnlyDelayed] = useState(false);
  const [onlyCancelled, setOnlyCancelled] = useState(false);
  const PAGE = 10;
  const [visibleCount, setVisibleCount] = useState(PAGE);
  const [claim, setClaim] = useState<ClaimInitial | null>(null);
  const [info, setInfo] = useState<Journey | null>(null);
  const [watch, setWatch] = useState<WatchTarget | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  const { data: stations = [] } = useStations();
  const stationOptions = useMemo(
    () =>
      stations
        .filter((s) => s.stop__id && s.station_name)
        .map((s) => ({ id: s.stop__id as string, name: s.station_name as string })),
    [stations]
  );
  const stationName = (id: string) =>
    stationOptions.find((s) => s.id === id)?.name ?? id;

  // The free-text box resolves to the station ids whose name matches the query,
  // so "Malmö" pulls every train touching a Malmö station (origin OR dest),
  // not a substring filter of the network sample. Capped so a 1-char query
  // doesn't build a giant id list.
  const matchedStationIds = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return stationOptions
      .filter((s) => s.name.toLowerCase().includes(q))
      .slice(0, 25)
      .map((s) => s.id);
  }, [query, stationOptions]);

  // Three mutually-exclusive board sources, in priority order:
  //   1. routeMode    — an exact O-D pair is selected (anyone, incl. logged out)
  //   2. stationMode  — the search box resolved to one or more stations
  //   3. network      — the representative tier sample (default)
  const routeMode = Boolean(from && to);
  const stationMode = !routeMode && matchedStationIds.length > 0;
  const network = useNetworkBoard(date, !routeMode && !stationMode);
  const station = useStationBoard(matchedStationIds, date, stationMode);
  const route = useJourneys({
    fromStopId: routeMode ? from : null,
    toStopId: routeMode ? to : null,
    date,
    onlyClaimable: false,
  });

  const allRows = routeMode ? route.data ?? [] : stationMode ? station.data ?? [] : network.data ?? [];
  const isLoading = routeMode ? route.isLoading : stationMode ? station.isLoading : network.isLoading;

  // Full filtered set (before pagination): text filter for the network sample,
  // then the delayed/cancelled checkboxes, then station-search ordering.
  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let r = allRows;

    // routeMode / stationMode already queried narrowly; only the network sample
    // needs the client-side text filter (station names only, so a line's
    // terminus string can't surface unrelated rows).
    if (!routeMode && !stationMode && q) {
      r = r.filter(
        (d) =>
          (d.origin_stop_name ?? "").toLowerCase().includes(q) ||
          (d.destination_stop_name ?? "").toLowerCase().includes(q)
      );
    }

    if (onlyDelayed || onlyCancelled) {
      r = r.filter((d) => {
        const cancelled = Boolean(d.canceled);
        const delayed = !cancelled && (d.destination_delay_minutes ?? 0) >= 4;
        return (onlyDelayed && delayed) || (onlyCancelled && cancelled);
      });
    }

    // All modes stay in chronological order (earliest at top, later further
    // down — the station query already orders ascending). Station search is
    // paged: the first 10 show, then "Visa fler avgångar" reveals later ones.
    return r;
  }, [allRows, query, routeMode, stationMode, onlyDelayed, onlyCancelled]);

  // Paginate only the station search; everything else shows its full (small) set.
  const paginated = stationMode;
  const rows = paginated ? filteredRows.slice(0, visibleCount) : filteredRows;
  const hasMore = paginated && filteredRows.length > visibleCount;

  // Reset the page size whenever the query that produced the list changes.
  useEffect(() => {
    setVisibleCount(PAGE);
  }, [query, date, from, to, onlyDelayed, onlyCancelled]);

  const focusSearch = () => {
    boardRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    setTimeout(() => boardRef.current?.querySelector("input")?.focus(), 280);
  };

  // "Bevaka som pendlare" — watch the selected O-D leg. Needs both stops chosen
  // and a signed-in user; otherwise nudge the user to the right place.
  const watchCommuter = () => {
    if (!user) {
      setClaim({ blank: true, loginOnly: true });
      return;
    }
    if (!from || !to) {
      boardRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      setTimeout(() => boardRef.current?.querySelector("select")?.focus(), 280);
      return;
    }
    setWatch({
      origin_scheduled: null,
      origin_local_date: date,
      origin_stop_id: from,
      destination_stop_id: to,
      origin_stop_name: stationName(from),
      destination_stop_name: stationName(to),
      line_name: null,
      service_number: null,
    });
  };

  const watchTrain = () => {
    setInfo(null);
    navigate(user ? "/settings" : "/login?next=/settings");
  };

  return (
    <div className="cmt-daylight">
      <Helmet>
        <link rel="canonical" href="https://qvitta.nu/" />
        <meta property="og:url" content="https://qvitta.nu/" />
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: [
              {
                "@type": "Question",
                name: "Vad gör jag om jag inte vet vilket tåg jag tog?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "Du var sen men minns inte avgången. Ange sträcka och tid — vi matchar mot trafikdatan och hittar rätt tåg.",
                },
              },
              {
                "@type": "Question",
                name: "Hur vet jag om jag har rätt till ersättning?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "Precis under 20 minuter, eller bara osäker? Vi visar vad våra uppgifter säger och hur nära gränsen du ligger.",
                },
              },
              {
                "@type": "Question",
                name: "Kan ni hålla koll på mina pendlarvanor?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "Ange dina pendlarvanor så mejlar vi dig så fort tågen du brukar ta är försenade — du missar aldrig en ersättning du kan ha rätt till.",
                },
              },
              {
                "@type": "Question",
                name: "Hur betalas ersättningen ut?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "Ersättningen betalas ut direkt från operatören till din valda mottagningsmetod — Swish eller bankkonto. Pengarna passerar aldrig oss.",
                },
              },
            ],
          })}
        </script>
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "Qvitta",
            applicationCategory: "FinanceApplication",
            operatingSystem: "Any",
            offers: {
              "@type": "Offer",
              price: "0",
              priceCurrency: "SEK",
            },
            description:
              "Automated train delay compensation tracker and claim filing for Swedish public transport commuters.",
            featureList: [
              "Live train departure board with delay tracking",
              "Automated compensation eligibility detection",
              "Claim form generation for Skånetrafiken",
              "Commute monitoring with email alerts",
            ],
          })}
        </script>
      </Helmet>
      <Nav
        signedIn={Boolean(user)}
        accountLabel={profile?.full_name || profile?.first_name || user?.email || "Konto"}
        onSignOut={() => void signOut()}
        onLogin={() => setClaim({ blank: true, loginOnly: true })}
      />
      <Hero onSearch={focusSearch} />
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
        from={from}
        to={to}
        setFrom={setFrom}
        setTo={setTo}
        stationOptions={stationOptions}
        onlyDelayed={onlyDelayed}
        onlyCancelled={onlyCancelled}
        setOnlyDelayed={setOnlyDelayed}
        setOnlyCancelled={setOnlyCancelled}
        hasMore={hasMore}
        onShowMore={() => setVisibleCount((c) => c + PAGE)}
        onClaim={(d) => setClaim(d)}
        onInfo={(d) => setInfo(d)}
        onWatch={(d) => (user ? setWatch(d) : setClaim({ blank: true, loginOnly: true }))}
        onWatchCommuter={watchCommuter}
      />
      <ValueProps
        onUnknown={() => setClaim({ blank: true })}
        onSearch={focusSearch}
        onHabits={() => (user ? navigate("/settings") : setClaim({ blank: true, loginOnly: true }))}
      />
      <Footer />

      {claim && <ClaimModal initial={claim} onClose={() => setClaim(null)} />}
      {info && <EligibilityModal dep={info} onClose={() => setInfo(null)} onWatch={watchTrain} />}
      {watch && <WatchModal journey={watch} onClose={() => setWatch(null)} />}
    </div>
  );
}
