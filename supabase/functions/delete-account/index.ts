// delete-account — permanent GDPR account deletion, called from Settings → Konto.
//
// verify_jwt=true: the gateway requires a valid user JWT; we then resolve WHICH
// user from that same token, so a user can only ever delete THEMSELVES. The
// service-role client does the actual work:
//   1. delete Storage objects (signatures/{uid}/*, plus any claims-bucket files
//      referenced by the user's claims rows),
//   2. delete digest_events rows (user_id column has no FK to auth.users),
//   3. auth.admin.deleteUser — cascades profiles/claims/commute_routes/digest_log
//      (all FK ON DELETE CASCADE, verified 2026-07-01).
//
// Irreversible by design. The frontend confirms with a typed "RADERA" before calling.

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers: CORS });
  }

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: CORS });
  }
  const uid = userData.user.id;

  try {
    // 1a. Signature files (own-folder convention {uid}/...).
    const { data: sigFiles } = await admin.storage.from("signatures").list(uid);
    if (sigFiles?.length) {
      await admin.storage.from("signatures").remove(sigFiles.map((f) => `${uid}/${f.name}`));
    }

    // 1b. Claim PDFs/screenshots referenced by the user's claims rows.
    const { data: claimRows } = await admin.from("claims").select("pdf_path").eq("user_id", uid);
    const pdfPaths = (claimRows ?? []).map((r) => r.pdf_path).filter((p): p is string => Boolean(p));
    if (pdfPaths.length) {
      await admin.storage.from("claims").remove(pdfPaths);
    }

    // 2. digest_events has user_id but no FK cascade.
    await admin.from("digest_events").delete().eq("user_id", uid);

    // 3. The auth user — cascades profiles, claims, commute_routes, digest_log.
    const { error: delErr } = await admin.auth.admin.deleteUser(uid);
    if (delErr) throw delErr;

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("delete-account failed", e);
    return new Response(JSON.stringify({ error: "delete_failed" }), { status: 500, headers: CORS });
  }
});
