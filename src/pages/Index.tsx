import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RefreshCw, ArrowLeftRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import DepartureCard from "@/components/DepartureCard";
import { supabase } from "@/integrations/supabase/client";
import { ROUTES, Direction } from "@/constants/stops";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Link } from "react-router-dom";
import UserMenu from "@/components/UserMenu";

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

const invokeDeparturesFunction = async (
  direction: Direction,
  timeShiftMinutes: number
): Promise<EdgeFunctionResponse> => {
  if (USE_LOCAL_FUNCTIONS && LOCAL_FUNCTIONS_BASE_URL) {
    const response = await fetch(`${LOCAL_FUNCTIONS_BASE_URL}/get-train-departures`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction, timeShiftMinutes }),
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(`Local function error ${response.status}: ${details}`);
    }

    return (await response.json()) as EdgeFunctionResponse;
  }

  const { data, error } = await supabase.functions.invoke("get-train-departures", {
    body: { direction, timeShiftMinutes },
  });

  if (error) {
    throw error;
  }

  return data as EdgeFunctionResponse;
};

const Index = () => {
  const [departures, setDepartures] = useState<Departure[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [direction, setDirection] = useState<Direction>("malmo-departures");
  const [selectedTrain, setSelectedTrain] = useState<string>("all");
  const [selectedDestination, setSelectedDestination] = useState<string>("all");
  const [storedTrainNames, setStoredTrainNames] = useState<string[]>([]);
  const [historyOffsetMinutes, setHistoryOffsetMinutes] = useState<number>(0);
  const { toast } = useToast();

  const fetchDepartures = async (offsetMinutes = historyOffsetMinutes) => {
    const clampedOffset = Math.max(0, Math.min(360, offsetMinutes));
    setLoading(true);
    try {
      const response = await invokeDeparturesFunction(direction, clampedOffset);
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
        }
      } catch (error) {
        console.error('Error fetching stored train names:', error);
      }
    };
    fetchStoredTrainNames();
  }, []);

  const trainNames = useMemo(() => {
    const currentNames = departures
      .map(d => d.lineName)
      .filter(name => name.toLowerCase().includes('tåg'));
    const allNames = [...new Set([...storedTrainNames, ...currentNames])];
    return allNames.sort();
  }, [departures, storedTrainNames]);

  const destinations = useMemo(() => {
    return departures
      .map(d => d.arrivalStation)
      .filter((dest, index, self) => self.indexOf(dest) === index)
      .sort();
  }, [departures]);

  const trainsByDestination = useMemo(() => {
    const map = new Map<string, Set<string>>();
    departures.forEach((d) => {
      const set = map.get(d.arrivalStation) ?? new Set<string>();
      set.add(d.lineName);
      map.set(d.arrivalStation, set);
    });
    return map;
  }, [departures]);

  const destinationsByTrain = useMemo(() => {
    const map = new Map<string, Set<string>>();
    departures.forEach((d) => {
      const set = map.get(d.lineName) ?? new Set<string>();
      set.add(d.arrivalStation);
      map.set(d.lineName, set);
    });
    return map;
  }, [departures]);

  const availableTrainNames = useMemo(() => {
    if (selectedDestination === "all") return trainNames;
    const trainsForDestination = trainsByDestination.get(selectedDestination);
    if (!trainsForDestination) return [];
    return trainNames.filter((name) => trainsForDestination.has(name));
  }, [selectedDestination, trainNames, trainsByDestination]);

  const availableDestinations = useMemo(() => {
    if (selectedTrain === "all") return destinations;
    const destsForTrain = destinationsByTrain.get(selectedTrain);
    if (!destsForTrain) return [];
    return destinations.filter((dest) => destsForTrain.has(dest));
  }, [selectedTrain, destinations, destinationsByTrain]);

  useEffect(() => {
    if (selectedTrain !== "all" && !availableTrainNames.includes(selectedTrain)) {
      setSelectedTrain("all");
    }
  }, [availableTrainNames, selectedTrain]);

  useEffect(() => {
    if (selectedDestination !== "all" && !availableDestinations.includes(selectedDestination)) {
      setSelectedDestination("all");
    }
  }, [availableDestinations, selectedDestination]);

  const filteredDepartures = useMemo(() => {
    let filtered = departures;
    if (selectedTrain !== "all") {
      filtered = filtered.filter(d => d.lineName === selectedTrain);
    }
    if (selectedDestination !== "all") {
      filtered = filtered.filter(d => d.arrivalStation === selectedDestination);
    }
    return filtered;
  }, [departures, selectedTrain, selectedDestination]);

  useEffect(() => {
    fetchDepartures();
    const interval = setInterval(() => fetchDepartures(), 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [direction, historyOffsetMinutes]);

  const handleLoadEarlier = () => {
    setHistoryOffsetMinutes((prev) => Math.min(prev + 60, 360));
  };

  const handleLoadLater = () => {
    setHistoryOffsetMinutes((prev) => Math.max(prev - 60, 0));
  };

  const handleResetOffset = () => {
    setHistoryOffsetMinutes(0);
    fetchDepartures(0);
  };

  const canLoadEarlier = historyOffsetMinutes < 360;
  const canLoadLater = historyOffsetMinutes > 0;

  const route = ROUTES[direction];

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        {/* Header */}
        <header className="mb-10">
          <div className="flex items-start justify-between mb-1">
            <div>
              <h1 className="text-3xl font-serif text-foreground tracking-tight">
                Claim My Train
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Track delays. Claim compensation.
              </p>
            </div>
            <UserMenu />
          </div>
        </header>

        {/* Route card */}
        <section className="mb-6">
          <Card className="p-5 border-border bg-card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">
                  Departing from
                </p>
                <p className="text-lg font-serif text-foreground">
                  {route.origin.shortName}
                </p>
              </div>
              <Button
                onClick={() =>
                  setDirection(
                    direction === "malmo-departures"
                      ? "hyllie-departures"
                      : "malmo-departures"
                  )
                }
                variant="outline"
                size="sm"
                className="gap-2"
              >
                <ArrowLeftRight className="h-3.5 w-3.5" />
                Switch
              </Button>
            </div>
          </Card>
        </section>

        {/* CTA */}
        <section className="mb-8">
          <Link to="/delay-alerts">
            <Button className="w-full h-12 text-sm font-medium tracking-wide">
              Check Claimable Delays
            </Button>
          </Link>
        </section>

        {/* Filters */}
        {(availableTrainNames.length > 0 || availableDestinations.length > 0) && (
          <section className="mb-6 space-y-3">
            {availableTrainNames.length > 0 && (
              <div className="flex items-center gap-3">
                <span className="text-xs uppercase tracking-widest text-muted-foreground shrink-0">
                  Train
                </span>
                <Select value={selectedTrain} onValueChange={setSelectedTrain}>
                  <SelectTrigger className="flex-1 h-9 text-sm">
                    <SelectValue placeholder="All trains" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {availableTrainNames.map((name) => (
                      <SelectItem key={name} value={name}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {availableDestinations.length > 0 && (
              <div className="flex items-center gap-3">
                <span className="text-xs uppercase tracking-widest text-muted-foreground shrink-0">
                  To
                </span>
                <Select value={selectedDestination} onValueChange={setSelectedDestination}>
                  <SelectTrigger className="flex-1 h-9 text-sm">
                    <SelectValue placeholder="All destinations" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {availableDestinations.map((dest) => (
                      <SelectItem key={dest} value={dest}>{dest}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </section>
        )}

        {/* Status bar */}
        <section className="mb-5">
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground space-y-0.5">
              <p>Updated {lastUpdated.toLocaleTimeString("sv-SE")}</p>
              {historyOffsetMinutes > 0 && (
                <p className="text-xs">
                  ~{historyOffsetMinutes} min ago ·{" "}
                  <button
                    onClick={handleResetOffset}
                    className="underline underline-offset-2 hover:text-foreground transition-colors"
                  >
                    back to now
                  </button>
                </p>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                onClick={handleLoadLater}
                disabled={loading || !canLoadLater}
                variant="ghost"
                size="sm"
                className="text-xs h-7 px-2"
              >
                Later
              </Button>
              <Button
                onClick={handleLoadEarlier}
                disabled={loading || !canLoadEarlier}
                variant="ghost"
                size="sm"
                className="text-xs h-7 px-2"
              >
                Earlier
              </Button>
              <Button
                onClick={() => fetchDepartures()}
                disabled={loading}
                variant="ghost"
                size="icon"
                className="h-7 w-7"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>
        </section>

        {/* Departures */}
        <main className="space-y-2">
          {loading && departures.length === 0 ? (
            <div className="text-center py-16">
              <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Loading departures…</p>
            </div>
          ) : filteredDepartures.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-sm text-muted-foreground">
                {selectedTrain === "all" && selectedDestination === "all"
                  ? "No departures found"
                  : "No departures match filters"}
              </p>
            </div>
          ) : (
            filteredDepartures.map((departure, index) => (
              <DepartureCard key={index} departure={departure} />
            ))
          )}
        </main>
      </div>
    </div>
  );
};

export default Index;
