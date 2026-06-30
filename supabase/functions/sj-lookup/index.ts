// sj-lookup — synchronous SJ booking/email validation for the claim pop-up.
//
// SJ's "Hämta resa" step is backed by a clean PUBLIC JSON API (no cookies/CSRF), so we can
// replicate it server-side with a plain fetch — no headless browser (which an edge function
// can't run anyway). This lets SjClaimModal catch a wrong booking/email INSTANTLY instead of
// waiting for the async claim-worker. It's a read-only LOOKUP — it never files a claim.
//
//   POST prod-api.adp.sj.se/.../delaycompensationtokens  {orderSecurity, orderOrTicketNumber}
//     400 ORDER_NOT_FOUND / ORDER_IS_NOT_VALID_FOR_RTG  -> SJ's "Vi hittar inte din bokning" notice
//     400 other code                              -> {status:"rejected", code} (surface SJ's code)
//     201 + existingServiceRequests non-empty     -> {status:"already_claimed"}
//     201 + existingServiceRequests empty         -> {status:"ok", journey:{from,to,date,time}}
//
// EVERY response carries a `message` = SJ's OWN form copy, verbatim, so the pop-up shows exactly
// what SJ says instead of a guess. The whole point of this layer is that SJ's information reaches
// the user word-for-word, never silently relabelled (a wrong booking and a not-yet-eligible
// booking BOTH render as SJ's "Vi hittar inte din bokning…" notice — so we use that text).
//
// verify_jwt=true: only signed-in users (the pop-up requires auth), so it can't be abused as
// an open SJ-booking brute-force proxy.

const SJ_TOKENS = "https://prod-api.adp.sj.se/public/delay-compensation/v1/compensation/delaycompensationtokens";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// SJ's APIM gateway requires these — the SAME static headers their public SPA sends
// (extracted from the live form 2026-06-23). The subscription key is a public, client-side
// value baked into sj.se's bundle, not a per-session secret. If SJ rotates it (or rejects a
// stale x-client-version), this lookup starts returning errors and the pop-up falls back to
// filing + the async worker's no_match check — re-capture the headers to refresh.
const SJ_HEADERS: Record<string, string> = {
  "content-type": "application/json",
  accept: "application/json",
  "user-agent": UA,
  "ocp-apim-subscription-key": "78e7aad0e7b042b685d70e0131d897ca",
  "x-api.sj.se-language": "sv",
  "x-client-name": "sjse-delay-compensation-client",
  "x-client-version": "20260623.0041-prod",
  referer: "https://www.sj.se/",
  "accept-language": "sv",
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ status: "error", reason: "method" }, 405);

  let booking = "", contact = "";
  try {
    const b = await req.json();
    booking = String(b.booking ?? "").trim().toUpperCase();
    contact = String(b.contact ?? "").trim();
  } catch {
    return json({ status: "error", reason: "bad_request" }, 400);
  }
  // Mirror SJ's own client-side rule so we never even call them with junk.
  if (!/^[A-Z0-9]{8}$|^[A-Z0-9]{12}$/.test(booking) || !contact) {
    return json({ status: "invalid" });
  }

  let r: Response;
  try {
    r = await fetch(SJ_TOKENS, {
      method: "POST",
      headers: SJ_HEADERS,
      body: JSON.stringify({ orderSecurity: contact, orderOrTicketNumber: booking }),
    });
  } catch (_e) {
    return json({ status: "error", reason: "sj_unreachable" }, 502);
  }

  if (r.status === 400) {
    let code = "";
    try { code = (await r.json())?.errors?.[0]?.code ?? ""; } catch { /* ignore */ }
    // SJ's OWN form copy, verbatim. It shows this exact notice both when the booking/email
    // don't match (ORDER_NOT_FOUND) and when the order isn't (yet) valid for compensation —
    // ORDER_IS_NOT_VALID_FOR_RTG, e.g. the trip isn't completed yet or it was another operator.
    // We mirror SJ's words instead of guessing "wrong booking number" / "not eligible".
    const SJ_NOT_FOUND =
      "Vi hittar inte din bokning. Det kan bero på att din resa ännu inte är genomförd eller att du rest med ett annat tågbolag.";
    switch (code) {
      case "ORDER_NOT_FOUND":
        return json({ status: "not_found", code, message: SJ_NOT_FOUND });
      // Order resolves but SJ won't take it yet. SJ presents this as the same "can't find
      // your booking" notice — so we surface the same wording (status kept distinct for logs).
      case "ORDER_IS_NOT_VALID_FOR_RTG":
        return json({ status: "ineligible", code, message: SJ_NOT_FOUND });
      // Any other code: surface SJ's code honestly rather than invent a reason.
      default:
        return json({ status: "rejected", code,
          message: `SJ kunde inte behandla bokningen${code ? ` (${code})` : ""}. Försök igen senare.` });
    }
  }
  if (!r.ok) return json({ status: "error", reason: "sj_http_" + r.status }, 502);

  let data: Record<string, unknown> = {};
  try { data = await r.json(); } catch { /* ignore */ }
  const existing = data?.["existingServiceRequests"];
  if (Array.isArray(existing) && existing.length > 0) {
    return json({ status: "already_claimed",
      message: "Den här bokningen har redan en ansökan hos SJ." });
  }

  // Found + claimable. Surface a tiny journey summary for the pop-up to confirm against.
  const item = (data?.["eligibleOrderItems"] as any[])?.[0];
  const journey = item ? {
    from: item.departureLocation?.name ?? null,
    to: item.arrivalLocation?.name ?? null,
    date: item.departureDate?.date ?? null,
    time: item.departureTime?.time ?? null,
  } : null;
  return json({ status: "ok", journey,
    message: "SJ hittade din resa och den ser ut att vara berättigad till ersättning." });
});
