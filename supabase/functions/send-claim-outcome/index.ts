// send-claim-outcome — emails the claim owner when the worker reaches an OUTCOME for a claim
// (submitted / generated / sj_already_claimed / error). Reuses the existing RESEND_API_KEY
// Supabase secret + the verified qvitta.nu sender, so the GitHub-Actions worker doesn't need
// the Resend key itself — it just POSTs {claim_id} here with its service-role bearer.
//
// BACKEND-ONLY. verify_jwt=false, but we authorize manually: the Authorization bearer MUST equal
// the project service-role key (which only the worker/backend holds), so a random user can't
// drive it. It never takes a recipient — it emails the claim's own owner, resolved server-side.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM = "Qvitta <noreply@qvitta.nu>";
const APP_URL = "https://qvitta.nu";

// status -> Swedish subject + heading + lead sentence. Only these are emailed (the worker's
// NOTIFY_STATUSES); awaiting_*_authorization etc. are intermediate and not notified.
const OUTCOME: Record<string, { subject: string; heading: string; lead: string }> = {
  submitted:          { subject: "Din ersättningsansökan är inskickad", heading: "Ansökan inskickad ✅", lead: "Vi har skickat in din ansökan om förseningsersättning." },
  generated:          { subject: "Din ersättningsblankett är klar",     heading: "Blankett klar",        lead: "Din reklamationsblankett är förberedd." },
  sj_already_claimed: { subject: "Ansökan fanns redan hos SJ",          heading: "Redan ansökt",         lead: "Det fanns redan en ansökan för den här resan hos SJ." },
  error:              { subject: "Vi kunde inte slutföra din ansökan",  heading: "Något gick fel",       lead: "Vi kunde tyvärr inte slutföra din ansökan automatiskt." },
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Service-level bearer check: exact match first; else validate BY USE via the Auth admin
// API (the repo secret may be the new sb_secret_… format while the edge env holds the
// legacy JWT — same privilege, different bytes; only a service-level key can list users).
async function isServiceBearer(req: Request): Promise<boolean> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return false;
  if (token === SERVICE_ROLE) return true;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=1`, {
      headers: { Authorization: `Bearer ${token}`, apikey: token },
    });
    return r.ok;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method", { status: 405 });
  // Backend-only: require a service-level bearer.
  if (!(await isServiceBearer(req))) return new Response("forbidden", { status: 403 });

  let claimId = "";
  try { claimId = String((await req.json()).claim_id ?? ""); } catch { /* ignore */ }
  if (!claimId) return new Response("bad_request", { status: 400 });

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: claim } = await sb.from("claims").select("*").eq("id", claimId).single();
  if (!claim) return new Response("no_claim", { status: 404 });

  const meta = OUTCOME[claim.status as string];
  if (!meta) return Response.json({ skipped: "status_not_notifiable", status: claim.status });
  if (!RESEND_API_KEY) return Response.json({ skipped: "no_resend_key" });

  // Resolve the account email (never a user-supplied recipient): profiles.email, else auth.
  let email: string | null = null;
  const { data: profile } = await sb.from("profiles").select("email").eq("id", claim.user_id).single();
  email = (profile?.email as string | null) ?? null;
  if (!email) {
    const { data: u } = await sb.auth.admin.getUserById(claim.user_id as string);
    email = u?.user?.email ?? null;
  }
  if (!email) return Response.json({ skipped: "no_email" });

  const route = `${claim.origin_stop_name ?? "?"} → ${claim.destination_stop_name ?? "?"}`;
  const date = String(claim.trip_start_date ?? "").slice(0, 10);
  // The operator's own words (SJ confirmation / "redan ansökt") or the error reason.
  const detail = (claim.provider_message as string) || (claim.error_message as string) || "";
  const ref = claim.external_reference as string | null;

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:520px;margin:0 auto;color:#0E0F10">
    <h2 style="margin:0 0 4px">${esc(meta.heading)}</h2>
    <p style="color:#475">${esc(meta.lead)}</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px">
      <tr><td style="color:#789;padding:4px 0">Resa</td><td style="text-align:right;font-weight:600">${esc(route)}</td></tr>
      <tr><td style="color:#789;padding:4px 0">Resdatum</td><td style="text-align:right">${esc(date)}</td></tr>
      ${ref ? `<tr><td style="color:#789;padding:4px 0">Ärendenummer</td><td style="text-align:right">${esc(ref)}</td></tr>` : ""}
    </table>
    ${detail ? `<div style="background:#F4F6F8;border-radius:10px;padding:12px 14px;font-size:14px;line-height:1.5"><b>Meddelande:</b> ${esc(detail)}</div>` : ""}
    <p style="margin:20px 0"><a href="${APP_URL}/settings" style="background:#0E8C7E;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;display:inline-block">Se dina ärenden</a></p>
    <p style="color:#9aa;font-size:12px">Qvitta · ${APP_URL}</p>
  </div>`;

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: FROM, to: email, subject: `${meta.subject} – ${route}`, html }),
  });
  if (!r.ok) return new Response(JSON.stringify({ error: await r.text() }), { status: 502 });
  return Response.json({ sent: true, to: email, status: claim.status });
});
