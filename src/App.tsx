import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";

// Pages are lazy-loaded so their CSS (~30KB via ?inline import) doesn't block
// the rest of the app. DaylightApp is the merged single-page app at `/` (live
// board + claim flow). ClaimReview is the bulk digest-email landing.
const DaylightApp = lazy(() => import("./pages/DaylightApp"));
const ClaimReview = lazy(() => import("./pages/ClaimReview"));
const MyDelays = lazy(() => import("./pages/MyDelays"));
const Admin = lazy(() => import("./pages/Admin"));
const ShortcutGuide = lazy(() => import("./pages/ShortcutGuide"));
const FAQ = lazy(() => import("./pages/FAQ"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Ersattning = lazy(() => import("./pages/Ersattning"));
const ErsattningGuide = lazy(() => import("./pages/ErsattningGuide"));

// The region pages (/regions/skanetrafiken/*) were retired — their function
// moved onto `/` and `/claim-review`. This preserves links in digest emails
// already sent (which point at the old /regions/skanetrafiken/claim-review URL)
// by forwarding to /claim-review with the ?journeys= payload intact.
const ClaimReviewRedirect = () => {
  const { search } = useLocation();
  return <Navigate to={`/claim-review${search}`} replace />;
};

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
              <Route path="/claim-review" element={<ClaimReview />} />
              <Route path="/my-delays" element={<MyDelays />} />
              <Route path="/genvag" element={<ShortcutGuide />} />
              <Route path="/admin" element={<Admin />} />
              {/* Retired region pages → forward old bookmarks/emails. */}
              <Route path="/regions/skanetrafiken/claim-review" element={<ClaimReviewRedirect />} />
              <Route path="/regions/skanetrafiken/delay-alerts" element={<Navigate to="/" replace />} />
              <Route path="/regions/skanetrafiken" element={<Navigate to="/" replace />} />
              <Route path="/faq" element={<FAQ />} />
              <Route path="/integritet" element={<Privacy />} />
              {/* SEO guide pages — prerendered to static HTML at build time. */}
              <Route path="/ersattning" element={<Ersattning />} />
              <Route path="/ersattning/:slug" element={<ErsattningGuide />} />
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
