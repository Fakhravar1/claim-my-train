import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import Index from "./pages/Index";
import DelayAlerts from "./pages/YellowAlerts";
import Login from "./pages/Login";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import ProtectedFromAuth from "@/components/landing/ProtectedFromAuth";

// Landing + regional pages are lazy-loaded so their CSS (~30KB via ?inline
// import) and inline SVG payload don't block the in-app journeys page.
const Landing = lazy(() => import("./pages/Landing"));
const Skanetrafiken = lazy(() => import("./pages/regions/Skanetrafiken"));
const SL = lazy(() => import("./pages/regions/SL"));
const Vasttrafik = lazy(() => import("./pages/regions/Vasttrafik"));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Suspense fallback={null}>
            <Routes>
              <Route
                path="/"
                element={
                  <ProtectedFromAuth>
                    <Landing />
                  </ProtectedFromAuth>
                }
              />
              <Route path="/app" element={<Index />} />
              <Route path="/regions/skanetrafiken" element={<Skanetrafiken />} />
              <Route path="/regions/sl" element={<SL />} />
              <Route path="/regions/vasttrafik" element={<Vasttrafik />} />
              <Route path="/login" element={<Login />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/delay-alerts" element={<DelayAlerts />} />
              <Route path="/yellow-alerts" element={<DelayAlerts />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
