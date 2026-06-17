import { forwardRef, useMemo } from "react";
import type { Journey } from "@/hooks/useJourneys";
import { statusMeta } from "@/lib/daylightStatus";
import { ArrowIcon, CheckIcon, CloseIcon, SearchIcon } from "./icons";

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

export function lineLabel(j: Journey): string {
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
  /** Route filter is shown only to signed-in users. */
  showRoute: boolean;
  from: string;
  to: string;
  setFrom: (id: string) => void;
  setTo: (id: string) => void;
  stationOptions: StationOption[];
  onClaim: (j: Journey) => void;
  onInfo: (j: Journey) => void;
  onUnknown: () => void;
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
    showRoute,
    from,
    to,
    setFrom,
    setTo,
    stationOptions,
    onClaim,
    onInfo,
    onUnknown,
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

          <div className="board__controls">
            {showRoute && (
              <>
                <label className="board__control">
                  <span>Från</span>
                  <select value={from} onChange={(e) => setFrom(e.target.value)}>
                    <option value="">Alla stationer</option>
                    {stationOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
                <label className="board__control">
                  <span>Till</span>
                  <select value={to} onChange={(e) => setTo(e.target.value)}>
                    <option value="">Alla stationer</option>
                    {stationOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
              </>
            )}
            <label className="board__control">
              <span>Datum</span>
              <input type="date" value={date} min={minDate} max={maxDate} onChange={(e) => setDate(e.target.value)} />
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
              <Row key={d.journey_key} d={d} onClaim={onClaim} onInfo={onInfo} />
            ))}
          </div>

          <div className="board__foot">
            <span>Hittar du inte din avgång?</span>
            <button className="linkbtn" onClick={onUnknown}>
              Ange resa manuellt <ArrowIcon width={14} height={14} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
});

function Row({ d, onClaim, onInfo }: { d: Journey; onClaim: (j: Journey) => void; onInfo: (j: Journey) => void }) {
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
      </div>
    </div>
  );
}
