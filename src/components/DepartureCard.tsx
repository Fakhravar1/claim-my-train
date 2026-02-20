import { Card } from "@/components/ui/card";

interface Departure {
  line: string;
  operator: string;
  lineName: string;
  departureStation: string;
  arrivalStation: string;
  departureTime: string;
  departureDate: string;
  scheduledTime?: string;
  arrivalTime: string | null;
  arrivalDate: string | null;
  scheduledArrivalTime?: string | null;
  isArrivalDelayed?: boolean;
  isArrivalEarly?: boolean;
  arrivalDelayMinutes?: number;
  track?: string;
  isDelayed: boolean;
  delayMinutes?: number;
}

interface DepartureCardProps {
  departure: Departure;
}

const parseTimeToSeconds = (value?: string | null) => {
  if (!value) return null;
  const [h, m, s = "0"] = value.split(":");
  const hh = Number(h);
  const mm = Number(m);
  const ss = Number(s);
  if ([hh, mm, ss].some(Number.isNaN)) return null;
  return hh * 3600 + mm * 60 + ss;
};

const DepartureCard = ({ departure }: DepartureCardProps) => {
  // Calculate travel duration
  const calculateDuration = () => {
    if (!departure.arrivalTime) return null;
    
    const [depHours, depMinutes] = departure.departureTime.split(':').map(Number);
    const [arrHours, arrMinutes] = departure.arrivalTime.split(':').map(Number);
    
    const depTotalMinutes = depHours * 60 + depMinutes;
    const arrTotalMinutes = arrHours * 60 + arrMinutes;
    
    const duration = arrTotalMinutes - depTotalMinutes;
    return duration > 0 ? duration : 0;
  };

  const duration = calculateDuration();
  const departureScheduled = departure.scheduledTime ?? departure.departureTime;
  const departureScheduledSeconds = parseTimeToSeconds(departureScheduled);
  const departureRealtimeSeconds = parseTimeToSeconds(departure.departureTime);
  const departureDeltaSeconds =
    departureScheduledSeconds !== null && departureRealtimeSeconds !== null
      ? departureRealtimeSeconds - departureScheduledSeconds
      : 0;
  const departureDeltaRounded =
    departureDeltaSeconds === 0
      ? 0
      : Math.sign(departureDeltaSeconds) * Math.floor(Math.abs(departureDeltaSeconds) / 60);
  const hasDepartureRealtime = departureDeltaSeconds !== 0;
  const departureRealtime = hasDepartureRealtime ? departure.departureTime : "";
  const departureDelta =
    departureDeltaRounded !== 0
      ? `${departureDeltaRounded > 0 ? "+" : ""}${departureDeltaRounded} min`
      : "";

  const arrivalScheduled = departure.scheduledArrivalTime ?? departure.arrivalTime ?? "";
  const arrivalScheduledSeconds = parseTimeToSeconds(arrivalScheduled);
  const arrivalRealtimeSeconds = parseTimeToSeconds(departure.arrivalTime);
  const arrivalDeltaSeconds =
    arrivalScheduledSeconds !== null && arrivalRealtimeSeconds !== null
      ? arrivalRealtimeSeconds - arrivalScheduledSeconds
      : 0;
  const arrivalDeltaRounded =
    arrivalDeltaSeconds === 0
      ? 0
      : Math.sign(arrivalDeltaSeconds) * Math.floor(Math.abs(arrivalDeltaSeconds) / 60);
  const hasArrivalRealtime = arrivalDeltaSeconds !== 0;
  const arrivalRealtime = hasArrivalRealtime ? departure.arrivalTime ?? "" : "";
  const arrivalDelta =
    arrivalDeltaRounded !== 0
      ? `${arrivalDeltaRounded > 0 ? "+" : ""}${arrivalDeltaRounded} min`
      : "";
  const hasOrangeChange = arrivalDeltaSeconds !== null && arrivalDeltaSeconds >= 40 * 60;
  const hasMajorChange =
    arrivalDeltaSeconds !== null &&
    arrivalDeltaSeconds >= 20 * 60 &&
    arrivalDeltaSeconds < 40 * 60;

  return (
    <Card
      className={`p-3 sm:p-4 hover:shadow-md transition-shadow ${
        hasOrangeChange
          ? "bg-orange-100 border-orange-300"
          : hasMajorChange
          ? "bg-yellow-100 border-yellow-300"
          : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3 sm:gap-4">
        <div className="flex items-start gap-3 sm:gap-4 flex-1">
          <div className="flex flex-col flex-1 min-w-0">
            <div className="flex items-baseline gap-2 mb-1">
              <span className="font-bold text-base sm:text-lg text-foreground">
                {departure.line}
              </span>
              <span className="text-xs sm:text-sm text-muted-foreground truncate">
                {departure.lineName}
              </span>
            </div>
            
            <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground mb-2">
              <span>{departure.departureStation}</span>
              <span>→</span>
              <span>{departure.arrivalStation}</span>
            </div>

            <div className="text-sm overflow-x-auto">
              <div className="min-w-[300px] sm:min-w-0">
                <div className="grid grid-cols-[56px_74px_74px_66px] sm:grid-cols-[72px_96px_96px_92px] gap-x-2 sm:gap-x-3 text-[11px] sm:text-xs text-muted-foreground mb-1">
                  <span></span>
                  <span>Scheduled</span>
                  <span>Realtime</span>
                  <span>Change</span>
                </div>

                <div className="grid grid-cols-[56px_74px_74px_66px] sm:grid-cols-[72px_96px_96px_92px] gap-x-2 sm:gap-x-3 gap-y-1 items-center">
                <span className="text-[11px] sm:text-xs text-muted-foreground">Departs</span>
                <span className={`font-semibold ${hasDepartureRealtime ? "text-muted-foreground line-through" : "text-foreground"}`}>
                  {departureScheduled || "\u00A0"}
                </span>
                <span
                  className={`font-semibold ${
                    hasDepartureRealtime
                      ? departureDeltaSeconds > 0
                        ? "text-destructive"
                        : "text-emerald-600"
                      : "text-transparent"
                  }`}
                >
                  {departureRealtime || "\u00A0"}
                </span>
                <span
                  className={`font-semibold ${
                    departureDelta !== ""
                      ? departureDeltaSeconds > 0
                        ? "text-destructive"
                        : "text-emerald-600"
                      : "text-transparent"
                  }`}
                >
                  {departureDelta || "\u00A0"}
                </span>

                <span className="text-[11px] sm:text-xs text-muted-foreground">Arrives</span>
                <span className={`font-semibold ${hasArrivalRealtime ? "text-muted-foreground line-through" : "text-foreground"}`}>
                  {arrivalScheduled || "\u00A0"}
                </span>
                <span
                  className={`font-semibold ${
                    hasArrivalRealtime
                      ? arrivalDeltaSeconds > 0
                        ? "text-destructive"
                        : "text-emerald-600"
                      : "text-transparent"
                  }`}
                >
                  {arrivalRealtime || "\u00A0"}
                </span>
                <span
                  className={`font-semibold ${
                    arrivalDelta !== ""
                      ? arrivalDeltaSeconds > 0
                        ? "text-destructive"
                        : "text-emerald-600"
                      : "text-transparent"
                  }`}
                >
                  {arrivalDelta || "\u00A0"}
                </span>
              </div>
              </div>

              {duration !== null && (
                <div className="mt-2 text-xs text-muted-foreground">
                  Duration: <span className="font-semibold text-foreground">{duration} min</span>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </Card>
  );
};

export default DepartureCard;
