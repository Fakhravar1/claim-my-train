import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// VAPID *public* key — public by design (pairs with the VAPID_PRIVATE_KEY
// Supabase secret used by the send-delay-push edge function).
export const VAPID_PUBLIC_KEY =
  "BLD7p1Hfq37kzt-RvwiAxrXSZc4RqjD7hnK6IXDeAhHmMcbvK4JFB12t6P_wTAEXJdPxh-7qb64ZMgi9lTEwr00";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Push is only possible in a secure context with SW + PushManager (on iOS: only when installed to home screen). */
export function pushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/**
 * Web Push subscribe/unsubscribe for delay notifications. The subscription is
 * stored in `public.push_subscriptions` (own-rows RLS — direct insert, no edge
 * function needed); the cron-driven `send-delay-push` function reads it.
 */
export function usePushSubscription() {
  const { user } = useAuth();
  const supported = pushSupported();
  const [subscribed, setSubscribed] = useState<boolean | null>(supported ? null : false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!supported || !user) {
      setSubscribed(false);
      return;
    }
    (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (!cancelled) setSubscribed(Boolean(sub));
      } catch {
        if (!cancelled) setSubscribed(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supported, user]);

  const subscribe = useCallback(async () => {
    if (!supported || !user) return false;
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setError("Notiser blockerade i webbläsaren — tillåt dem i inställningarna.");
        return false;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
        }));
      const json = sub.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error("Ogiltig prenumeration");
      const { error: dbError } = await supabase.from("push_subscriptions").upsert(
        {
          user_id: user.id,
          endpoint: json.endpoint,
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
          user_agent: navigator.userAgent.slice(0, 250),
        },
        { onConflict: "endpoint" }
      );
      if (dbError) throw dbError;
      setSubscribed(true);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte aktivera notiser.");
      return false;
    } finally {
      setBusy(false);
    }
  }, [supported, user]);

  const unsubscribe = useCallback(async () => {
    if (!supported) return;
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte stänga av notiser.");
    } finally {
      setBusy(false);
    }
  }, [supported]);

  return { supported, subscribed, busy, error, subscribe, unsubscribe };
}
