import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RefreshCw, Train, ArrowRight } from "lucide-react";
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

  // Extract unique destinations
  const destinations = useMemo(() => {
    const dests = departures
      .map(d => d.arrivalStation)
      .filter((dest, index, self) => self.indexOf(dest) === index)
      .sort();
    return dests;
  }, [departures]);

  // Build lookup tables for cross-filtering
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

  // Options constrained by the other filter
  const availableTrainNames = useMemo(() => {
    if (selectedDestination === "all") {
      return trainNames;
    }
    const trainsForDestination = trainsByDestination.get(selectedDestination);
    if (!trainsForDestination) return [];
    return trainNames.filter((name) => trainsForDestination.has(name));
  }, [selectedDestination, trainNames, trainsByDestination]);

  const availableDestinations = useMemo(() => {
    if (selectedTrain === "all") {
      return destinations;
    }
    const destsForTrain = destinationsByTrain.get(selectedTrain);
    if (!destsForTrain) return [];
    return destinations.filter((dest) => destsForTrain.has(dest));
  }, [selectedTrain, destinations, destinationsByTrain]);

  // Reset selections if they become invalid after cross-filtering
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

  // Filter departures based on selected train and destination
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
    // Auto-refresh every 15 minutes
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

  const offsetLabel =
    historyOffsetMinutes > 0
      ? `Showing departures from ~${historyOffsetMinutes} minutes earlier`
      : "Showing latest departures";
  const canLoadEarlier = historyOffsetMinutes < 360;
  const canLoadLater = historyOffsetMinutes > 0;
  const backendLabel =
    USE_LOCAL_FUNCTIONS && LOCAL_FUNCTIONS_BASE_URL
      ? `Backend: local (${LOCAL_FUNCTIONS_BASE_URL})`
      : "Backend: cloud";

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <div className="mb-2">
            <h1 className="text-3xl font-bold text-foreground">Claim My Train</h1>
            <p className="text-sm text-muted-foreground">
              Find delayed departures and claim what you&apos;re owed.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
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
              <Button
                onClick={() => fetchDepartures()}
                disabled={loading}
                variant="default"
                size="icon"
                className="rounded-full h-11 w-11 bg-green-600 hover:bg-green-700 text-white"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>
          
          {/* Direction Selector */}
          <Card className="p-4 bg-card border-border mb-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3 flex-1">
                <Train className="h-6 w-6 text-primary" />
                <div className="flex flex-col">
                  <span className="text-sm text-muted-foreground">Route</span>
                  <span className="font-semibold text-foreground">
                    From {ROUTES[direction].origin.shortName}
                  </span>
                </div>
              </div>
              <Button
                onClick={() => setDirection(direction === "malmo-departures" ? "hyllie-departures" : "malmo-departures")}
                variant="outline"
                size="sm"
                className="gap-2 w-full sm:w-auto"
              >
                <ArrowRight className="h-4 w-4" />
                Switch station
              </Button>
            </div>
          </Card>

          {/* Train Filter */}
          {availableTrainNames.length > 0 && (
            <Card className="p-4 bg-card border-border mb-4">
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

          {/* Destination Filter */}
          {availableDestinations.length > 0 && (
            <Card className="p-4 bg-card border-border mb-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                <span className="text-sm text-muted-foreground whitespace-nowrap">Filter by destination:</span>
                <Select value={selectedDestination} onValueChange={setSelectedDestination}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Show all destinations" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Show all</SelectItem>
                    {availableDestinations.map((dest) => (
                      <SelectItem key={dest} value={dest}>
                        {dest}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </Card>
          )}

          <div className="mt-2 mb-2 flex justify-center">
            <Link to="/delay-alerts" className="w-full sm:w-auto">
              <Button
                size="lg"
                className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-8 py-6 text-base font-semibold"
              >
                Check Claimable Delays
              </Button>
            </Link>
          </div>
        </div>

        {/* Last updated */}
        <div className="text-sm text-muted-foreground mb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
            <div className="flex flex-col">
              <span>Last updated: {lastUpdated.toLocaleTimeString("sv-SE")}</span>
              <span className="text-xs text-muted-foreground">{backendLabel}</span>
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
        <div className="space-y-3">
          {loading && departures.length === 0 ? (
            <div className="text-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">Loading departures...</p>
            </div>
          ) : filteredDepartures.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground">
                {selectedTrain === "all" && selectedDestination === "all" 
                  ? "No departures found" 
                  : "No departures match the selected filters"}
              </p>
            </Card>
          ) : (
            filteredDepartures.map((departure, index) => (
              <DepartureCard key={index} departure={departure} />
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default Index;
