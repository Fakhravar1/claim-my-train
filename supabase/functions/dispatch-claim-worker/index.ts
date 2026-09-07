// dispatch-claim-worker — fire the Claim PDF worker the moment a claim is filed,
// instead of waiting for the next */15 cron tick.
//
// WHY THIS EXISTS. Filing a claim was a plain client-side INSERT into public.claims
// and nothing told the backend about it: the worker is a poller, so a filed claim
// waited 0–15 min (GitHub free-tier jitter makes it 15 min–1 h in practice) before
// anyone tried to submit it. For SJ — where we drive the operator's live form — that
// delay is the whole gap between "filed" and "actually lodged with SJ".
//
// WHY NOT dispatch-workflow. That function's allowlist deliberately excludes the
// claim workers: its PAT can fire any workflow, so a leaked DISPATCH_SECRET must not
// reach anything that acts on a user's behalf at an operator. That reasoning still
// holds, so this is a SEPARATE function with a SEPARATE secret, and it can dispatch
// exactly one workflow.
//
// AUTH — two callers, no dashboard step needed:
//   1. claim_dispatch_secret, a Vault secret the claims trigger sends. Validated via
//      the check_claim_dispatch_secret RPC rather than an env var, so the value lives
//      in Vault only (migration 20260907120000).
//   2. A service-level bearer — the isServiceBearer pattern from
//      fire-claude-investigator / report-claim-canary: exact match first, else
//      validated BY USE against the Auth admin API, because the same privilege is
//      issued in two key formats (sb_secret_… vs legacy JWT) and an equality check
//      alone returns a confusing 403 from CI (§19).
//
// Requires the existing GH_DISPATCH_PAT edge secret (Actions: read and write).
// Supabase edge secrets are project-wide, so it is already in scope here.
//
// POST { dryRun?: boolean }

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const GH_PAT = Deno.env.get('GH_DISPATCH_PAT') ?? ''
const GH_REPO = Deno.env.get('GH_DISPATCH_REPO') ?? 'Fakhravar1/claim-my-train'

// The ONE workflow this function may fire. Not configurable by the caller — the
// caller is a database trigger, and narrowing the blast radius is the point.
const WORKFLOW = 'claim-pdf-worker.yml'
const REF = 'main'

async function isServiceBearer(token: string): Promise<boolean> {
  if (!token) return false
  if (SERVICE_ROLE && token === SERVICE_ROLE) return true
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=1`, {
      headers: { Authorization: `Bearer ${token}`, apikey: token },
    })
    return r.ok
  } catch {
    return false
  }
}

/** Is this the Vault secret the claims trigger sends? Compared in SQL so the secret
 *  itself never leaves the database. */
async function isDispatchSecret(token: string): Promise<boolean> {
  if (!token || !SERVICE_ROLE) return false
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/check_claim_dispatch_secret`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SERVICE_ROLE}`,
        apikey: SERVICE_ROLE,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ candidate: token }),
    })
    if (!r.ok) return false
    return (await r.json()) === true
  } catch {
    return false
  }
}

const gh = (path: string, init: RequestInit = {}) =>
  fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${GH_PAT}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'qvitta-dispatch-claim-worker',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  })

/**
 * Is a run already queued or in progress?
 *
 * Bulk filing (the /claim-review digest path) inserts many claims across a couple of
 * statements, and a user can file again seconds later. Each of those trips the
 * trigger, but one run drains EVERY pending claim — so past the first, extra
 * dispatches are pure noise. Fails OPEN: if the check errors we dispatch anyway,
 * because a redundant run is cheap and a dropped filing is not.
 */
async function alreadyRunning(): Promise<string | null> {
  for (const status of ['queued', 'in_progress']) {
    try {
      const r = await gh(`/repos/${GH_REPO}/actions/workflows/${WORKFLOW}/runs?status=${status}&per_page=1`)
      if (!r.ok) continue
      const body = await r.json()
      if ((body.workflow_runs ?? []).length > 0) return status
    } catch {
      // fail open
    }
  }
  return null
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method', { status: 405 })

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!(await isDispatchSecret(token)) && !(await isServiceBearer(token))) {
    return new Response('forbidden', { status: 403 })
  }

  let dryRun = false
  try {
    const body = req.headers.get('Content-Type')?.includes('json') ? await req.json() : {}
    dryRun = body.dryRun === true
  } catch {
    // The trigger POSTs a bare '{}' — an unparseable body is not an error.
  }

  if (!GH_PAT) {
    return new Response(JSON.stringify({ success: false, error: 'GH_DISPATCH_PAT not set' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } })
  }

  const busy = await alreadyRunning()
  if (dryRun) {
    return new Response(JSON.stringify({ success: true, dryRun: true, workflow: WORKFLOW, busy }),
      { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  if (busy) {
    return new Response(
      JSON.stringify({ success: true, dispatched: false, skipped: `run already ${busy}`, workflow: WORKFLOW }),
      { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  // claim-pdf-worker.yml declares no inputs; its own preflight decides what to install.
  const d = await gh(`/repos/${GH_REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: 'POST',
    body: JSON.stringify({ ref: REF }),
  })
  const ok = d.status === 204
  if (!ok) console.error('dispatch failed', d.status, (await d.text()).slice(0, 300))

  return new Response(
    JSON.stringify({ success: ok, dispatched: ok, workflow: WORKFLOW, ref: REF, status: d.status }),
    { status: ok ? 200 : 502, headers: { 'Content-Type': 'application/json' } })
})
