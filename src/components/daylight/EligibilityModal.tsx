import type { Journey } from "@/hooks/useJourneys";
import { statusMeta, tiersFor } from "@/lib/daylightStatus";
import { Scrim, ModalHead } from "./primitives";
import { BellIcon } from "./icons";

/**
 * Near-threshold "Har jag rätt?" modal — opened from a board row just under the
 * eligibility line. The line is DISTANCE-DEPENDENT: 60 min for routes >= 150 km
 * (EU 2021/782), 20 min for shorter regional routes (Lag 2015:953). Presentational;
 * "Bevaka åt mig" hands off to the watch flow (commuter habits / digest) via onWatch.
 */
export function EligibilityModal({
  dep,
  onClose,
  onWatch,
}: {
  dep: Journey;
  onClose: () => void;
  onWatch: () => void;
}) {
  const { minutes } = statusMeta(dep.destination_delay_minutes, Boolean(dep.canceled), dep.route_distance_km);
  const threshold = tiersFor(dep.route_distance_km).eligible;
  const gap = Math.max(0, threshold - minutes);
  return (
    <Scrim onClose={onClose}>
      <div className="modal modal--sm">
        <ModalHead title="Har jag rätt?" onClose={onClose} />
        <div className="modal__body">
          <p className="lead">
            Enligt våra uppgifter är den här avgången <b>{minutes} min</b> sen. Gränsen för ersättning
            går vid <b>{threshold} min</b> — du är <b>{gap} {gap === 1 ? "minut" : "minuter"}</b> ifrån.
          </p>
          <div className="thresh">
            <div className="thresh__bar">
              <span style={{ width: Math.min(100, (minutes / threshold) * 100) + "%" }} />
            </div>
            <div className="thresh__labels"><span>0</span><span>{threshold} min · gräns</span></div>
          </div>
          <p className="muted">
            Förseningar växer ofta efter avgång. Låt oss bevaka den – tippar den över {threshold} minuter
            förbereder vi din ansökan och hör av oss.
          </p>
        </div>
        <div className="modal__foot">
          <button className="btn btn--ghost" onClick={onClose}>Stäng</button>
          <button className="btn btn--accent" onClick={onWatch}>
            Bevaka åt mig <BellIcon width={16} height={16} />
          </button>
        </div>
      </div>
    </Scrim>
  );
}
