import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import Login from "./pages/Login";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import ProtectedFromAuth from "@/components/landing/ProtectedFromAuth";

// Landing + regional pages are lazy-loaded so their CSS (~30KB via ?inline
// import) and inline SVG payload don't block the rest of the app.
const Landing = lazy(() => import("./pages/Landing"));
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
              <Route
                path="/"
                element={
                  <ProtectedFromAuth>
                    <Landing />
                  </ProtectedFromAuth>
                }
              />
              <Route path="/regions/skanetrafiken" element={<SkanetrafikenApp />} />
              <Route path="/regions/skanetrafiken/delay-alerts" element={<SkanetrafikenDelayAlerts />} />
              <Route path="/regions/skanetrafiken/claim-review" element={<SkanetrafikenClaimReview />} />
              <Route path="/login" element={<Login />} />
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
