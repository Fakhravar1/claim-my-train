import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RefreshCw, Train, Clock3 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import DepartureCard from "@/components/DepartureCard";
import UserMenu from "@/components/UserMenu";
import { supabase } from "@/integrations/supabase/client";
import { STOPS, Direction, STOP_OPTIONS, getDirectionForStops } from "@/constants/stops";
import { useAuth } from "@/contexts/AuthContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Link, useSearchParams } from "react-router-dom";

interface Departure {
  line: string;
  operator: string;
  lineName: string;
  transportCategory?: string;
  departureStationId?: string;
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

interface EdgeFunctionResponse {
  direction: string;
  updatedAt: string;
  departures: Departure[];
}

const USE_LOCAL_FUNCTIONS = import.meta.env.VITE_USE_LOCAL_FUNCTIONS === "true";
const LOCAL_FUNCTIONS_BASE_URL = (import.meta.env.VITE_LOCAL_FUNCTIONS_URL as string | undefined)?.replace(/\/$/, "");
const DEFAULT_FROM_STOP_ID = STOPS.MALMO_C.id;
const DEFAULT_TO_STOP_ID = STOPS.COPENHAGEN_H.id;
const isValidStopId = (id: string | null) => Boolean(id && STOP_OPTIONS.some((stop) => stop.id === id));

const invokeDeparturesFunction = async (
  direction: Direction,
  timeShiftMinutes: number,
  originId?: string,
  destinationId?: string
): Promise<EdgeFunctionResponse> => {
  if (USE_LOCAL_FUNCTIONS && LOCAL_FUNCTIONS_BASE_URL) {
    const response = await fetch(`${LOCAL_FUNCTIONS_BASE_URL}/get-train-departures`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction, timeShiftMinutes, originId, destinationId }),
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(`Local function error ${response.status}: ${details}`);
    }

    return (await response.json()) as EdgeFunctionResponse;
  }

  const { data, error } = await supabase.functions.invoke("get-train-departures", {
    body: { direction, timeShiftMinutes, originId, destinationId },
  });

  if (error) {
    throw error;
  }

  return data as EdgeFunctionResponse;
};

const Index = () => {
  const { profile } = useAuth();
  const [searchParams] = useSearchParams();
  const routeFromParam = searchParams.get("from");
  const routeToParam = searchParams.get("to");
  const initialFromStopId =
    isValidStopId(routeFromParam) && routeFromParam !== routeToParam
      ? (routeFromParam as string)
      : DEFAULT_FROM_STOP_ID;
  const initialToStopId =
    isValidStopId(routeToParam) && routeToParam !== initialFromStopId
      ? (routeToParam as string)
      : DEFAULT_TO_STOP_ID;
  const [departures, setDepartures] = useState<Departure[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [fromStopId, setFromStopId] = useState<string>(initialFromStopId);
  const [toStopId, setToStopId] = useState<string>(initialToStopId);
  const [selectedTrain, setSelectedTrain] = useState<string>("all");
  const [storedTrainNames, setStoredTrainNames] = useState<string[]>([]);
  const [historyOffsetMinutes, setHistoryOffsetMinutes] = useState<number>(0);
  const { toast } = useToast();
  const fromStop = STOP_OPTIONS.find((stop) => stop.id === fromStopId) ?? STOP_OPTIONS[0];
  const toStop = STOP_OPTIONS.find((stop) => stop.id === toStopId) ?? STOP_OPTIONS[STOP_OPTIONS.length - 1];
  const direction: Direction = useMemo(
    () => getDirectionForStops(fromStopId, toStopId),
    [fromStopId, toStopId]
  );

  const fetchDepartures = async (offsetMinutes = historyOffsetMinutes) => {
    const clampedOffset = Math.max(0, Math.min(360, offsetMinutes));
    setLoading(true);
    try {
      const response = await invokeDeparturesFunction(direction, clampedOffset, fromStopId, toStopId);
      
      setDepartures(response.departures ?? []);
      setLastUpdated(new Date());
    } catch (error) {
      console.error("Error fetching departures:", error);
      toast({
        title: "Error",
        description: "Failed to fetch departure information",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };


  // Fetch stored train names on component mount
  useEffect(() => {
    const fetchStoredTrainNames = async () => {
      try {
        const { data, error } = await supabase
          .from('train_names')
          .select('name')
          .order('last_seen', { ascending: false });
        
        if (error) throw error;
        
        if (data && data.length > 0) {
          setStoredTrainNames(data.map(item => item.name));
          console.log(`Loaded ${data.length} stored train names`);
        }
      } catch (error) {
        console.error('Error fetching stored train names:', error);
      }
    };
    
    fetchStoredTrainNames();
  }, []);

  // Merge stored train names with current departures
  const trainNames = useMemo(() => {
    const currentNames = departures
      .map(d => d.lineName)
      .filter(name => name.toLowerCase().includes('tåg'));
    
    // Merge and deduplicate
    const allNames = [...new Set([...storedTrainNames, ...currentNames])];
    return allNames.sort();
  }, [departures, storedTrainNames]);

  const availableTrainNames = useMemo(() => trainNames, [trainNames]);

  // Reset selections if they become invalid after cross-filtering
  useEffect(() => {
    if (selectedTrain !== "all" && !availableTrainNames.includes(selectedTrain)) {
      setSelectedTrain("all");
    }
  }, [availableTrainNames, selectedTrain]);

  // Filter departures based on selected train
  const filteredDepartures = useMemo(() => {
    let filtered = departures;
    
    if (selectedTrain !== "all") {
      filtered = filtered.filter(d => d.lineName === selectedTrain);
    }

    return filtered;
  }, [departures, selectedTrain]);

  useEffect(() => {
    fetchDepartures();
    // Auto-refresh every 15 minutes for current route.
    const interval = setInterval(() => fetchDepartures(), 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [direction, fromStopId, toStopId]);

  const handleLoadEarlier = () => {
    setHistoryOffsetMinutes((prev) => {
      const next = Math.min(prev + 60, 360);
      void fetchDepartures(next);
      return next;
    });
  };

  const handleLoadLater = () => {
    setHistoryOffsetMinutes((prev) => {
      const next = Math.max(prev - 60, 0);
      void fetchDepartures(next);
      return next;
    });
  };

  const handleResetOffset = () => {
    setHistoryOffsetMinutes(0);
    fetchDepartures(0);
  };

  const handleFromChange = (value: string) => {
    setHistoryOffsetMinutes(0);
    setFromStopId(value);
    if (value === toStopId) {
      const fallback = STOP_OPTIONS.find((stop) => stop.id !== value);
      if (fallback) setToStopId(fallback.id);
    }
  };

  const handleToChange = (value: string) => {
    setHistoryOffsetMinutes(0);
    setToStopId(value);
    if (value === fromStopId) {
      const fallback = STOP_OPTIONS.find((stop) => stop.id !== value);
      if (fallback) setFromStopId(fallback.id);
    }
  };

  const handleSearchRoute = () => {
    setHistoryOffsetMinutes(0);
    fetchDepartures(0);
  };

  const offsetLabel =
    historyOffsetMinutes > 0
      ? `Showing departures from ~${historyOffsetMinutes} minutes earlier`
      : "Showing latest departures";
  const canLoadEarlier = historyOffsetMinutes < 360;
  const canLoadLater = historyOffsetMinutes > 0;
  const backendLabel = USE_LOCAL_FUNCTIONS && LOCAL_FUNCTIONS_BASE_URL ? `Local backend: ${LOCAL_FUNCTIONS_BASE_URL}` : null;

  useEffect(() => {
    if (!profile) return;
    const hasRouteParams = isValidStopId(routeFromParam) || isValidStopId(routeToParam);
    if (hasRouteParams) return;
    if (profile.preferred_from_stop_id && profile.preferred_from_stop_id !== fromStopId) {
      setFromStopId(profile.preferred_from_stop_id);
    }
    if (profile.preferred_to_stop_id && profile.preferred_to_stop_id !== toStopId) {
      setToStopId(profile.preferred_to_stop_id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.preferred_from_stop_id, profile?.preferred_to_stop_id, routeFromParam, routeToParam]);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Header */}
        <div className="mb-10">
          <div className="mb-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground/80">Live departures</p>
            <h1 className="text-4xl font-semibold tracking-tight text-foreground">Claim My Train</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Find delayed departures and claim what you&apos;re owed.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-5">
            <div className="flex items-center gap-2 flex-wrap">
              {historyOffsetMinutes > 0 && (
                <Button
                  onClick={handleResetOffset}
                  variant="ghost"
                  size="sm"
                  disabled={loading}
                >
                  Back to latest
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <UserMenu />
              <Button
                onClick={() => fetchDepartures()}
                disabled={loading}
                variant="default"
                size="icon"
                className="h-11 w-11 rounded-full"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>
          
          {/* Direction Selector */}
          <Card className="mb-4 p-5">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <Train className="h-6 w-6 text-primary" />
                <div className="flex flex-col">
                  <span className="text-sm text-muted-foreground">Route</span>
                  <span className="font-semibold text-foreground">
                    {fromStop.shortName} to {toStop.shortName}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">From</span>
                  <Select value={fromStopId} onValueChange={handleFromChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STOP_OPTIONS.filter((stop) => stop.id !== toStopId).map((stop) => (
                        <SelectItem key={stop.id} value={stop.id}>
                          {stop.shortName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">To</span>
                  <Select value={toStopId} onValueChange={handleToChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STOP_OPTIONS.filter((stop) => stop.id !== fromStopId).map((stop) => (
                        <SelectItem key={stop.id} value={stop.id}>
                          {stop.shortName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSearchRoute} disabled={loading} className="min-w-32">
                  Search route
                </Button>
              </div>
            </div>
          </Card>

          <div className="mt-2 mb-4 flex justify-center">
            <Link to={`/delay-alerts?from=${encodeURIComponent(fromStopId)}&to=${encodeURIComponent(toStopId)}`} className="w-full sm:w-auto">
              <Button
                size="lg"
                className="w-full rounded-full px-8 py-6 text-base font-semibold shadow-lg shadow-primary/20 sm:w-auto"
              >
                Check Claimable Delays
              </Button>
            </Link>
          </div>

          {/* Train Filter */}
          {availableTrainNames.length > 0 && (
            <Card className="mb-4 p-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                <span className="text-sm text-muted-foreground whitespace-nowrap">Filter by train:</span>
                <Select value={selectedTrain} onValueChange={setSelectedTrain}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Show all trains" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Show all</SelectItem>
                    {availableTrainNames.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </Card>
          )}

        </div>

        {/* Last updated */}
        <div className="mb-5 text-sm text-muted-foreground">
          <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card/70 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col">
              <div className="flex items-center gap-2 text-foreground">
                <Clock3 className="h-4 w-4 text-primary" />
                <span className="text-base font-semibold">Last updated {lastUpdated.toLocaleTimeString("sv-SE")}</span>
              </div>
              <span className="text-xs text-muted-foreground">Times are shown in local Swedish time.</span>
              {backendLabel && <span className="text-xs text-muted-foreground">{backendLabel}</span>}
              <span className="text-xs text-muted-foreground">{offsetLabel}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={handleLoadLater}
                disabled={loading || !canLoadLater}
                variant="outline"
                size="sm"
              >
                Load later
              </Button>
              <Button
                onClick={handleLoadEarlier}
                disabled={loading || !canLoadEarlier}
                variant="outline"
                size="sm"
              >
                Load earlier
              </Button>
            </div>
          </div>
        </div>

        {/* Departures list */}
        <div className="space-y-4">
          {loading && departures.length === 0 ? (
            <div className="text-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">Loading departures...</p>
            </div>
          ) : filteredDepartures.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground">
                {selectedTrain === "all" ? "No departures found" : "No departures match the selected train"}
              </p>
            </Card>
          ) : (
            filteredDepartures.map((departure, index) => {
              const previousDeparture = index > 0 ? filteredDepartures[index - 1] : null;
              const hasDateBoundary = !previousDeparture || previousDeparture.departureDate !== departure.departureDate;

              return (
                <div key={`${departure.line}-${departure.departureDate}-${departure.departureTime}-${index}`} className="space-y-3">
                  {hasDateBoundary && (
                    <div className="flex items-center gap-3 py-1">
                      <div className="h-px flex-1 bg-border/80" />
                      <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold uppercase tracking-wide text-foreground">
                        {departure.departureDate}
                      </span>
                      <div className="h-px flex-1 bg-border/80" />
                    </div>
                  )}
                  <DepartureCard departure={departure} />
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default Index;
