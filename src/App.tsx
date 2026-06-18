import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";

// Landing + regional pages are lazy-loaded so their CSS (~30KB via ?inline
// import) and inline SVG payload don't block the rest of the app.
// DaylightApp is the merged single-page redesign now served at `/` (it embeds
// the live board + claim flow, so the old ProtectedFromAuth bounce is gone —
// signed-in users stay on `/`).
const DaylightApp = lazy(() => import("./pages/DaylightApp"));
const SkanetrafikenApp = lazy(() => import("./pages/regions/SkanetrafikenApp"));
const SkanetrafikenDelayAlerts = lazy(() => import("./pages/regions/SkanetrafikenDelayAlerts"));
const SkanetrafikenClaimReview = lazy(() => import("./pages/regions/SkanetrafikenClaimReview"));

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
              <Route path="/" element={<DaylightApp />} />
              <Route path="/regions/skanetrafiken" element={<SkanetrafikenApp />} />
              <Route path="/regions/skanetrafiken/delay-alerts" element={<SkanetrafikenDelayAlerts />} />
              <Route path="/regions/skanetrafiken/claim-review" element={<SkanetrafikenClaimReview />} />
              <Route path="/settings" element={<Settings />} />
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
