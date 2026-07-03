import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCommuteRoutes } from "@/hooks/useCommuteRoutes";
import { useMyDelays } from "@/hooks/useMyDelays";
import { useMyClaims } from "@/hooks/useMyClaims";

type BadgeNavigator = Navigator & {
  setAppBadge?: (n: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

/**
 * Sets the installed-PWA app-icon badge to the signed-in user's count of
 * unclaimed delays on their monitored commute routes (same subtraction as
 * MyDelays: v_claimable_journeys minus already-claimed journey_keys).
 * Feature-detected no-op everywhere the Badging API is unavailable
 * (uninstalled tab, Firefox, iOS Safari tab). Best-effort by design.
 */
export function useAppBadge() {
  const { user } = useAuth();
  const { data: routes = [] } = useCommuteRoutes(user?.id);
  const { data: journeys = [] } = useMyDelays(user?.id, routes);
  const { data: myClaims = [] } = useMyClaims(user?.id);

  useEffect(() => {
    const nav = navigator as BadgeNavigator;
    if (!nav.setAppBadge) return;
    if (!user) {
      nav.clearAppBadge?.().catch(() => {});
      return;
    }
    const claimedKeys = new Set(myClaims.map((c) => c.journey_key));
    const count = journeys.filter((j) => j.journey_key && !claimedKeys.has(j.journey_key)).length;
    if (count > 0) {
      nav.setAppBadge(count).catch(() => {});
    } else {
      nav.clearAppBadge?.().catch(() => {});
    }
  }, [user, journeys, myClaims]);
}
