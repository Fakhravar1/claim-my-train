// dispatch-workflow — picks the runner BEFORE dispatching a GitHub Actions
// workflow, so a self-hosted outage degrades to a hosted run instead of hanging.
//
// WHY THIS EXISTS (docs/pi-runner-plan.md §3). GitHub has no native "fall back
// to a hosted runner if the self-hosted one is offline". A job targeting an
// offline self-hosted runner does NOT fail — it QUEUES SILENTLY for up to 24 h
// and is then cancelled. That is strictly worse than failing: nothing alerts,
// and the hourly triggers pile up behind it. `timeout-minutes` does not help,
// because it starts counting when the job starts, not while queued.
//
// So the choice has to be made before dispatch, by something that is neither the
// Pi nor a GitHub-hosted job — hence an edge function, matching the pattern used
// everywhere else in this project (pg_cron → edge function → outbound API call,
// like fire-claude-investigator). Doing the probe in an `ubuntu-latest` job
// instead would cost 1 billed minute per run (~720/month at hourly), which would
// defeat the entire point of moving work to the Pi.
//
// BACKEND-ONLY, and deliberately NOT unauthenticated. The sibling collectors are
// called headerless by pg_cron because triggering them is harmless; this one can
// dispatch workflows and cancel runs, so an open endpoint would let anyone burn
// the account's Actions minutes. It accepts two callers:
//
//   1. DISPATCH_SECRET — a dedicated, narrow-privilege shared secret whose only
//      power is "trigger a dispatch". This is what pg_cron sends, read from
//      Vault (vault.decrypted_secrets) so no key sits in plaintext in cron.job,
//      and so the service-role key never has to be stored in the database.
//   2. A service-level bearer — same isServiceBearer pattern as
//      fire-claude-investigator / report-claim-canary: exact match against
//      SUPABASE_SERVICE_ROLE_KEY first, else validated BY USE against the Auth
//      admin API, because callers may hold the same privilege in different key
//      formats (sb_secret_… vs legacy JWT). This is the path the freshness
//      watchdog and any GitHub Actions caller would use.
//
// Requires edge secret GH_DISPATCH_PAT — a fine-grained PAT with repo
// permissions **Administration: read** (to list runners) and **Actions: read and
// write** (to dispatch and cancel). The default GITHUB_TOKEN cannot list
// runners; `administration` is not among the scopes it can be granted.
//
// POST { workflow?, ref?, dryRun?, runner? }
//   workflow : workflow file name        (default dbt-run.yml)
//   ref      : git ref to dispatch on    (default main)
//   dryRun   : probe + report the decision, dispatch nothing
//   runner   : force a runner, skipping the probe (escape hatch / watchdog use)

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const GH_PAT = Deno.env.get('GH_DISPATCH_PAT') ?? ''
const GH_REPO = Deno.env.get('GH_DISPATCH_REPO') ?? 'Fakhravar1/claim-my-train'
const DISPATCH_SECRET = Deno.env.get('DISPATCH_SECRET') ?? ''

const SELF_HOSTED_LABEL = 'qvitta-pi'
const FALLBACK_RUNNER = 'ubuntu-latest'
const DEFAULT_WORKFLOW = 'dbt-run.yml'
const DEFAULT_REF = 'main'

// Only these may be dispatched. The PAT behind this function can fire ANY
// workflow in the repo, so the allowlist is what stops a leaked DISPATCH_SECRET
// (or an over-eager automated caller) from reaching the claim workers, the
// Lovable mirror, or anything else that touches user money or production deploys.
const ALLOWED_WORKFLOWS = new Set(['dbt-run.yml', 'pi-maintenance.yml'])

// Workflows pinned to `runs-on: qvitta-pi` with no hosted equivalent. These are
// REFUSED when the Pi is offline rather than dispatched, because dispatching
// them would park a job in the 24 h silent queue — the exact failure this whole
// function exists to prevent. Refusing gives the caller an answer it can act on.
const PI_ONLY_WORKFLOWS = new Set(['pi-maintenance.yml'])

// FALLBACK THROTTLE — added with Phase 3 (docs/pi-runner-plan.md §5).
//
// Phase 3 raises the cron to every 15 min, which is free while the Pi serves.
// But the plan's failsafe budget in §6 ("~72 billed min/day, roughly 20 days of
// continuous fallback") was computed at HOURLY cadence and does not survive the
// change: at */15 a sustained Pi outage would dispatch ~96 hosted runs/day
// ≈ 288 billed min/day, burning a month's headroom in under a week — silently,
// and precisely when nobody is watching. That is the §6 risk "the fallback burns
// minutes exactly when you are not watching", made 4× worse.
//
// So: the Pi gets 15-min freshness, hosted fallback degrades to HOURLY. During a
// Pi outage only the top-of-hour tick actually dispatches; the other three are
// reported as skipped. Freshness during an outage is then no worse than what the
// project ran on from 2026-07-07 until today.
//
// Stateless on purpose — no table, no clock skew, nothing to get out of sync.
// Set to 60 to disable the throttle (every tick may fall back).
//
// NOT applied when the caller forces a runner: the freshness watchdog's
// self-heal passes an explicit `runner`, and that is a breach response which
// must never be throttled.
const FALLBACK_MAX_MINUTE = 15

async function authorized(req: Request): Promise<boolean> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return false
  // pg_cron's narrow-privilege path (see header). Checked first so the normal
  // hourly call never touches the Auth admin API.
  if (DISPATCH_SECRET && token === DISPATCH_SECRET) return true
  if (token === SERVICE_ROLE) return true
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=1`, {
      headers: { Authorization: `Bearer ${token}`, apikey: token },
    })
    return r.ok
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
      'User-Agent': 'qvitta-dispatch-workflow',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  })

/**
 * Is a runner carrying SELF_HOSTED_LABEL online?
 *
 * FAILS SAFE: any error — bad PAT, GitHub outage, unexpected shape — returns
 * false, so we dispatch to the hosted runner. Burning a billed minute is a much
 * cheaper mistake than parking the job in a 24 h silent queue.
 */
async function selfHostedOnline(): Promise<{ online: boolean; detail: string }> {
  try {
    const r = await gh(`/repos/${GH_REPO}/actions/runners`)
    if (!r.ok) {
      return { online: false, detail: `runners api ${r.status}` }
    }
    const body = await r.json()
    const runners: Array<{ name: string; status: string; busy: boolean; labels: Array<{ name: string }> }> =
      body.runners ?? []
    const match = runners.find(
      (x) => x.status === 'online' && (x.labels ?? []).some((l) => l.name === SELF_HOSTED_LABEL),
    )
    if (!match) {
      const seen = runners.map((x) => `${x.name}:${x.status}`).join(',') || 'none'
      return { online: false, detail: `no online '${SELF_HOSTED_LABEL}' runner (seen: ${seen})` }
    }
    // Deliberately NOT gated on `busy`. A busy Pi means the previous build is
    // still going; the workflow's own concurrency group handles that, and
    // waiting behind a run on a machine we know is alive is not the silent-queue
    // failure mode this function exists to prevent.
    return { online: true, detail: `${match.name} online${match.busy ? ' (busy)' : ''}` }
  } catch (e) {
    return { online: false, detail: `probe threw: ${e}` }
  }
}

/**
 * Third layer from §3: clear runs already stuck in `queued` for this workflow
 * before adding another. Stops a pile-up if the Pi went offline between a
 * previous probe and the job being picked up.
 */
async function cancelQueued(workflow: string): Promise<number> {
  try {
    const r = await gh(`/repos/${GH_REPO}/actions/workflows/${workflow}/runs?status=queued&per_page=50`)
    if (!r.ok) return 0
    const body = await r.json()
    const runs: Array<{ id: number }> = body.workflow_runs ?? []
    let cancelled = 0
    for (const run of runs) {
      const c = await gh(`/repos/${GH_REPO}/actions/runs/${run.id}/cancel`, { method: 'POST' })
      if (c.ok) cancelled++
      else console.error('cancel failed', run.id, c.status)
    }
    return cancelled
  } catch (e) {
    console.error('cancelQueued threw', e)
    return 0
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method', { status: 405 })
  if (!(await authorized(req))) return new Response('forbidden', { status: 403 })

  let workflow = DEFAULT_WORKFLOW
  let ref = DEFAULT_REF
  let dryRun = false
  let forced = ''
  let passthrough: Record<string, string> | null = null
  try {
    const body = req.headers.get('Content-Type')?.includes('json') ? await req.json() : {}
    if (typeof body.workflow === 'string' && body.workflow) workflow = body.workflow
    if (typeof body.ref === 'string' && body.ref) ref = body.ref
    if (typeof body.runner === 'string' && body.runner) forced = body.runner
    // Inputs for workflows that take something other than `runner` (currently
    // pi-maintenance.yml's `action`). Coerced to strings — GitHub rejects a
    // dispatch whose inputs do not match the workflow's declared ones, which is
    // itself a useful guard against a malformed caller.
    if (body.inputs && typeof body.inputs === 'object') {
      passthrough = Object.fromEntries(
        Object.entries(body.inputs as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
      )
    }
    dryRun = body.dryRun === true
  } catch {
    // pg_cron POSTs with no body — that is the normal path, not an error.
  }

  if (!ALLOWED_WORKFLOWS.has(workflow)) {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'workflow_not_allowed',
        workflow,
        allowed: [...ALLOWED_WORKFLOWS],
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  if (!GH_PAT) {
    return new Response(
      JSON.stringify({ success: false, error: 'GH_DISPATCH_PAT not set' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  // Pi-only workflows have no hosted equivalent: probe and REFUSE when offline,
  // rather than dispatching into the silent queue.
  if (PI_ONLY_WORKFLOWS.has(workflow)) {
    const probe = await selfHostedOnline()
    if (!probe.online) {
      return new Response(
        JSON.stringify({
          success: false,
          dispatched: false,
          skipped: 'pi_offline',
          workflow,
          detail: `${probe.detail} — refused rather than queued; this workflow only runs on the Pi, ` +
            `and a dead Pi cannot be fixed remotely (needs physical access)`,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }
    if (dryRun) {
      return new Response(
        JSON.stringify({ success: true, dryRun: true, workflow, ref, inputs: passthrough, detail: probe.detail }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }
    const m = await gh(`/repos/${GH_REPO}/actions/workflows/${workflow}/dispatches`, {
      method: 'POST',
      body: JSON.stringify({ ref, inputs: passthrough ?? {} }),
    })
    const mOk = m.status === 204
    if (!mOk) console.error('pi-maintenance dispatch failed', m.status, (await m.text()).slice(0, 300))
    return new Response(
      JSON.stringify({
        success: mOk,
        dispatched: mOk,
        workflow,
        ref,
        inputs: passthrough,
        detail: probe.detail,
        status: m.status,
      }),
      { status: mOk ? 200 : 502, headers: { 'Content-Type': 'application/json' } },
    )
  }

  let runner: string
  let detail: string
  if (forced) {
    runner = forced
    detail = 'forced by caller, probe skipped'
  } else {
    const probe = await selfHostedOnline()
    runner = probe.online ? SELF_HOSTED_LABEL : FALLBACK_RUNNER
    detail = probe.detail
  }

  // See FALLBACK_MAX_MINUTE. Applies only to unforced hosted fallbacks.
  const minute = new Date().getUTCMinutes()
  const throttled = !forced && runner === FALLBACK_RUNNER && minute >= FALLBACK_MAX_MINUTE

  if (dryRun) {
    return new Response(
      JSON.stringify({ success: true, dryRun: true, workflow, ref, runner, detail, throttled }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }

  if (throttled) {
    return new Response(
      JSON.stringify({
        success: true,
        dispatched: false,
        skipped: 'fallback_throttled',
        workflow,
        runner,
        detail: `${detail}; hosted fallback throttled to the top of the hour (minute ${minute})`,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const cancelled = await cancelQueued(workflow)

  const d = await gh(`/repos/${GH_REPO}/actions/workflows/${workflow}/dispatches`, {
    method: 'POST',
    body: JSON.stringify({ ref, inputs: { runner } }),
  })
  const ok = d.status === 204
  if (!ok) console.error('dispatch failed', d.status, (await d.text()).slice(0, 300))

  return new Response(
    JSON.stringify({
      success: ok,
      dispatched: ok,
      workflow,
      ref,
      runner,
      detail,
      cancelledQueued: cancelled,
      status: d.status,
    }),
    { status: ok ? 200 : 502, headers: { 'Content-Type': 'application/json' } },
  )
})
