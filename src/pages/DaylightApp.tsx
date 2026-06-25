import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useAuth } from "@/contexts/AuthContext";
import { useDaylightStyles } from "@/hooks/useDaylightStyles";
import { useNetworkBoard, useStationBoard } from "@/hooks/useNetworkBoard";
import { useJourneys, type Journey } from "@/hooks/useJourneys";
import type { WatchTarget } from "@/components/daylight/WatchModal";
import { useStations } from "@/hooks/useStations";
import { statusMeta } from "@/lib/daylightStatus";
import { Nav, Hero, ValueProps, Footer } from "@/components/daylight/shell";
import { Board } from "@/components/daylight/Board";
import { ClaimModal, type ClaimInitial } from "@/components/daylight/ClaimModal";
import { SjClaimModal } from "@/components/daylight/SjClaimModal";
import { HeadlessClaimModal } from "@/components/daylight/HeadlessClaimModal";
import { ShortcutClaimModal } from "@/components/daylight/ShortcutClaimModal";
import { RegionalClaimModal } from "@/components/daylight/RegionalClaimModal";
import { useStationAuthorities } from "@/hooks/useStationAuthorities";
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
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, profile, loading: authLoading, signOut } = useAuth();

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const [date, setDate] = useState(today);
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [onlyDelayed, setOnlyDelayed] = useState(false);
  const [onlyCancelled, setOnlyCancelled] = useState(false);
  const [onlyClaimable, setOnlyClaimable] = useState(false);

  // Live departures (v_journeys) only reach back ~raw retention (14 d), but the
  // claimable view reads the 90-day durable retention layer — so when the user
  // is browsing claimables let the date picker reach the full claim window.
  const minDate = useMemo(() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - (onlyClaimable ? 90 : 14));
    return d.toISOString().slice(0, 10);
  }, [onlyClaimable]);
  const PAGE = 10;
  const [visibleCount, setVisibleCount] = useState(PAGE);
  const [claim, setClaim] = useState<ClaimInitial | null>(null);
  // Öresundståg: when the user overrides the derived authority to Skånetrafiken (in-app),
  // hand off from RegionalClaimModal to the standard ClaimModal. Reset whenever the claim
  // target changes/closes.
  const [regionalInApp, setRegionalInApp] = useState(false);
  useEffect(() => { if (!claim) setRegionalInApp(false); }, [claim]);
  const [info, setInfo] = useState<Journey | null>(null);
  const [watch, setWatch] = useState<WatchTarget | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  const { data: stations = [] } = useStations();
  const { data: stationAuthorities } = useStationAuthorities();
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
    // Route mode pulls from the 90-day claimable layer when the claimable
    // filter is on (older delays stay filable past the 14-day live horizon).
    onlyClaimable: routeMode && onlyClaimable,
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

    if (onlyClaimable) {
      r = r.filter((d) => statusMeta(d.destination_delay_minutes, Boolean(d.canceled), d.route_distance_km).eligible);
    }

    // All modes stay in chronological order (earliest at top, later further
    // down — the station query already orders ascending). Station search is
    // paged: the first 10 show, then "Visa fler avgångar" reveals later ones.
    return r;
  }, [allRows, query, routeMode, stationMode, onlyDelayed, onlyCancelled, onlyClaimable]);

  // Paginate only the station search; everything else shows its full (small) set.
  const paginated = stationMode;
  const rows = paginated ? filteredRows.slice(0, visibleCount) : filteredRows;
  const hasMore = paginated && filteredRows.length > visibleCount;

  // Reset the page size whenever the query that produced the list changes.
  useEffect(() => {
    setVisibleCount(PAGE);
  }, [query, date, from, to, onlyDelayed, onlyCancelled, onlyClaimable]);

  // "Mina förseningar" entry point (signed-in account menu → /?mine=1#board):
  // jump to claimable-only, seeded with the user's preferred route if they
  // haven't picked one explicitly yet. Runs once the profile has loaded.
  useEffect(() => {
    if (searchParams.get("mine") !== "1" || authLoading) return;
    setOnlyClaimable(true);
    if (!from && !to && profile?.preferred_from_stop_id && profile?.preferred_to_stop_id) {
      setFrom(profile.preferred_from_stop_id);
      setTo(profile.preferred_to_stop_id);
    }
    boardRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    const next = new URLSearchParams(searchParams);
    next.delete("mine");
    setSearchParams(next, { replace: true });
    // searchParams must be a dep: otherwise clicking "Mina förseningar" while
    // already on `/` changes the URL but never re-fires this effect. After it
    // deletes `mine` the effect re-runs once and early-returns (no loop).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, profile, searchParams]);

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
    if (user) {
      navigate("/settings");
    } else {
      setClaim({ blank: true, loginOnly: true });
    }
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
                  text: "Precis under gränsen, eller bara osäker? Vi visar vad våra uppgifter säger och hur nära gränsen du ligger.",
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
      <main>
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
          onlyClaimable={onlyClaimable}
          setOnlyDelayed={setOnlyDelayed}
          setOnlyCancelled={setOnlyCancelled}
          setOnlyClaimable={setOnlyClaimable}
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
      </main>
      <Footer />

      {claim && (() => {
        const isRealJourney = !(claim as { blank?: boolean }).blank;
        const journey = claim as Journey;

        // SJ trips aren't standing commutes — a signed-in SJ user claiming a known journey
        // gets the focused SJ pop-up (booking + purchase email).
        if (user && profile?.purchasing_operator === "sj" && isRealJourney) {
          return <SjClaimModal journey={journey} onClose={() => setClaim(null)} />;
        }

        // Hallandstrafiken + Kalmar have no BankID → filed server-side by the headless worker.
        // The pop-up collects the ticket id and creates the pending claim (any device).
        if (user && profile?.purchasing_operator === "hallandstrafiken" && isRealJourney) {
          return <HeadlessClaimModal journey={journey} operator="hallandstrafiken" label="Hallandstrafiken" onClose={() => setClaim(null)} />;
        }
        if (user && profile?.purchasing_operator === "kalmar" && isRealJourney) {
          return <HeadlessClaimModal journey={journey} operator="kalmar" label="Kalmar länstrafik" onClose={() => setClaim(null)} />;
        }

        // SL files on its own BankID-gated form. On iPhone we hand the journey to the
        // "Qvitta" iOS Shortcut (deep link → stash → open SL → re-run to autofill); on
        // other devices the modal just links out to SL's form. No claims row either way.
        if (user && profile?.purchasing_operator === "sl" && isRealJourney) {
          return <ShortcutClaimModal journey={journey} operator="sl" onClose={() => setClaim(null)} />;
        }

        // Västtrafik (Göteborg) — BankID at the END of its form, so the Shortcut fills
        // client-side and the user authenticates + submits last. Same modal as SL.
        if (user && profile?.purchasing_operator === "vasttrafik" && isRealJourney) {
          return <ShortcutClaimModal journey={journey} operator="vasttrafik" onClose={() => setClaim(null)} />;
        }

        // Skånetrafiken's online BankID form — iPhone-only Shortcut autofill, additive to
        // the in-app PDF flow (ClaimModal) which stays the path on desktop and for anyone
        // who prefers it. Only intercept the literal 'skanetrafiken' operator (NOT the
        // Öresundståg-in-Skåne case, which files as skanetrafiken via ClaimModal below).
        if (
          user && profile?.purchasing_operator === "skanetrafiken" && isRealJourney &&
          typeof navigator !== "undefined" &&
          (/iP(hone|ad|od)/.test(navigator.userAgent) ||
            (/Macintosh/.test(navigator.userAgent) && "ontouchend" in document))
        ) {
          return <ShortcutClaimModal journey={journey} operator="skanetrafiken" onClose={() => setClaim(null)} />;
        }

        // Öresundståg is origin-routed: the claim goes to the länstrafikbolag of the county
        // where the journey started. Skåne/Köpenhamn-origin (region key skanetrafiken) files
        // in-app via ClaimModal below; other counties confirm + link out via RegionalClaimModal.
        if (user && profile?.purchasing_operator === "oresundstag" && isRealJourney && !regionalInApp) {
          const key = (journey.origin_stop_id && stationAuthorities?.get(journey.origin_stop_id)) || "skanetrafiken";
          if (key !== "skanetrafiken") {
            return (
              <RegionalClaimModal
                journey={journey}
                derivedKey={key}
                onUseInApp={() => setRegionalInApp(true)}
                onClose={() => setClaim(null)}
              />
            );
          }
        }

        // Blank/login entries, Skånetrafiken/Pågatåg, and Öresundståg-in-Skåne use the
        // standard multi-step ClaimModal (Öresundståg files as skanetrafiken — see buildClaimPayload).
        return <ClaimModal initial={claim} onClose={() => setClaim(null)} />;
      })()}
      {info && <EligibilityModal dep={info} onClose={() => setInfo(null)} onWatch={watchTrain} />}
      {watch && <WatchModal journey={watch} onClose={() => setWatch(null)} />}
    </div>
  );
}
