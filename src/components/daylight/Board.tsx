import { forwardRef, useMemo } from "react";
import type { Journey } from "@/hooks/useJourneys";
import { statusMeta } from "@/lib/daylightStatus";
import { ArrowIcon, BellIcon, CheckIcon, CloseIcon, SearchIcon } from "./icons";
import { StationField } from "./StationField";

/** HH:MM in Stockholm local time from an ISO timestamp. */
function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Stockholm",
  });
}

/** Short day label, e.g. "15 jun". */
function fmtDayShort(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso)
    .toLocaleDateString("sv-SE", { day: "numeric", month: "short", timeZone: "Europe/Stockholm" })
    .replace(".", "");
}

export function lineLabel(j: Pick<Journey, "line_name" | "service_number">): string {
  return j.line_name ?? "Tåg " + (j.service_number ?? "");
}

export type StationOption = { id: string; name: string };

type BoardProps = {
  rows: Journey[];
  loading: boolean;
  query: string;
  setQuery: (q: string) => void;
  date: string;
  setDate: (d: string) => void;
  maxDate: string;
  minDate: string;
  from: string;
  to: string;
  setFrom: (id: string) => void;
  setTo: (id: string) => void;
  stationOptions: StationOption[];
  /** Filter checkboxes (delayed / cancelled / claimable). */
  onlyDelayed: boolean;
  onlyCancelled: boolean;
  onlyClaimable: boolean;
  setOnlyDelayed: (v: boolean) => void;
  setOnlyCancelled: (v: boolean) => void;
  setOnlyClaimable: (v: boolean) => void;
  /** Pagination — station search reveals rows in batches of 10. */
  hasMore: boolean;
  onShowMore: () => void;
  onClaim: (j: Journey) => void;
  onInfo: (j: Journey) => void;
  onWatch: (j: Journey) => void;
  /** "Bevaka som pendlare" — watch the selected O-D leg as a commuter. */
  onWatchCommuter: () => void;
};

export const Board = forwardRef<HTMLDivElement, BoardProps>(function Board(
  {
    rows,
    loading,
    query,
    setQuery,
    date,
    setDate,
    maxDate,
    minDate,
    from,
    to,
    setFrom,
    setTo,
    stationOptions,
    onlyDelayed,
    onlyCancelled,
    onlyClaimable,
    setOnlyDelayed,
    setOnlyCancelled,
    setOnlyClaimable,
    hasMore,
    onShowMore,
    onClaim,
    onInfo,
    onWatch,
    onWatchCommuter,
  },
  ref
) {
  const elig = useMemo(
    () => rows.filter((d) => statusMeta(d.destination_delay_minutes, Boolean(d.canceled)).eligible).length,
    [rows]
  );

  return (
    <section className="board-wrap" id="board" ref={ref}>
      <div className="wrap">
        <div className="board">
          <div className="board__head">
            <div className="board__title">
              <span className="live"><span className="live__dot" />LIVE</span>
              <span className="board__h">Förseningar i nätet</span>
            </div>
            <div className="search">
              <SearchIcon width={16} height={16} className="search__icon" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Sök station – t.ex. Lund C, Ystad, Helsingborg…"
                aria-label="Sök station"
              />
              {query && (
                <button className="search__clear" onClick={() => setQuery("")} aria-label="Rensa">
                  <CloseIcon width={14} height={14} />
                </button>
              )}
            </div>
          </div>

          <p className="board__cap">
            <b>Sök station</b> visar alla tåg som rör en station. Vill du se en specifik avgång?
            Välj <b>från</b> och <b>till</b> nedan.
          </p>

          <div className="board__controls">
            <StationField label="Från" value={from} onChange={setFrom} options={stationOptions} />
            <StationField label="Till" value={to} onChange={setTo} options={stationOptions} />
            <label className="board__control">
              <span>Datum</span>
              <input type="date" value={date} min={minDate} max={maxDate} onChange={(e) => setDate(e.target.value)} />
            </label>
          </div>

          <div className="board__filters">
            <label className="board__filter">
              <input
                type="checkbox"
                checked={onlyDelayed}
                onChange={(e) => setOnlyDelayed(e.target.checked)}
              />
              Försenade
            </label>
            <label className="board__filter">
              <input
                type="checkbox"
                checked={onlyCancelled}
                onChange={(e) => setOnlyCancelled(e.target.checked)}
              />
              Inställda
            </label>
            <label className="board__filter">
              <input
                type="checkbox"
                checked={onlyClaimable}
                onChange={(e) => setOnlyClaimable(e.target.checked)}
              />
              Kan ge ersättning
            </label>
          </div>

          <div className="board__sub">
            <span>
              {rows.length} avgångar{query ? " · filtrerat på “" + query + "”" : ""}
            </span>
            <span className="board__elig">{elig} kan ge ersättning</span>
          </div>

          <div className="rows">
            {loading && <div className="empty">Hämtar avgångar…</div>}
            {!loading && rows.length === 0 && query && (
              <div className="empty">
                Inga avgångar matchar <b>{query}</b>. Prova ett annat stationsnamn.
              </div>
            )}
            {!loading && rows.length === 0 && !query && (
              <div className="empty">Inga avgångar att visa för {date}.</div>
            )}
            {!loading && rows.map((d) => (
              <Row key={d.journey_key} d={d} onClaim={onClaim} onInfo={onInfo} onWatch={onWatch} />
            ))}
          </div>

          {!loading && hasMore && (
            <div className="board__more">
              <button className="btn btn--quiet btn--sm" onClick={onShowMore}>
                Visa fler avgångar
              </button>
            </div>
          )}

          <div className="board__foot">
            <span>Pendlar du den här sträckan? Få mejl när tåget är sent.</span>
            <button className="linkbtn" onClick={onWatchCommuter}>
              Bevaka som pendlare <BellIcon width={14} height={14} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
});

function Row({
  d,
  onClaim,
  onInfo,
  onWatch,
}: {
  d: Journey;
  onClaim: (j: Journey) => void;
  onInfo: (j: Journey) => void;
  onWatch: (j: Journey) => void;
}) {
  const m = statusMeta(d.destination_delay_minutes, Boolean(d.canceled));
  return (
    <div className={"row row--" + m.tone}>
      <div className="row__time">
        <span className="row__dep">{fmtTime(d.origin_scheduled)}</span>
        <span className="row__date">{fmtDayShort(d.origin_local_date)}</span>
      </div>
      <div className="row__route">
        <div className="row__stations">
          <span className="st st--from">{d.origin_stop_name}</span>
          <span className="st__arrow"><ArrowIcon width={15} height={15} /></span>
          <span className="st st--to">{d.destination_stop_name}</span>
        </div>
        <span className="row__line">{lineLabel(d)}</span>
      </div>
      <div className="row__status">
        <span className={"tag tag--" + m.tone}>{m.chipLabel}</span>
        {m.near && <span className="row__hint">Strax under gränsen</span>}
      </div>
      <div className="row__action">
        {m.eligible && (
          <button className="btn btn--accent btn--sm" onClick={() => onClaim(d)}>
            Ansök om ersättning
          </button>
        )}
        {m.near && (
          <button className="btn btn--quiet btn--sm" onClick={() => onInfo(d)}>
            Har jag rätt?
          </button>
        )}
        {!m.eligible && !m.near && (
          <span className="row__ok"><CheckIcon width={15} height={15} /></span>
        )}
        <button
          type="button"
          className="watchbtn"
          onClick={() => onWatch(d)}
          aria-label="Bevaka åt mig"
          title="Bevaka åt mig"
        >
          <BellIcon width={16} height={16} />
        </button>
      </div>
    </div>
  );
}
