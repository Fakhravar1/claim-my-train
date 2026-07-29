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
  try {
    const body = req.headers.get('Content-Type')?.includes('json') ? await req.json() : {}
    if (typeof body.workflow === 'string' && body.workflow) workflow = body.workflow
    if (typeof body.ref === 'string' && body.ref) ref = body.ref
    if (typeof body.runner === 'string' && body.runner) forced = body.runner
    dryRun = body.dryRun === true
  } catch {
    // pg_cron POSTs with no body — that is the normal path, not an error.
  }

  if (!GH_PAT) {
    return new Response(
      JSON.stringify({ success: false, error: 'GH_DISPATCH_PAT not set' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
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

  if (dryRun) {
    return new Response(
      JSON.stringify({ success: true, dryRun: true, workflow, ref, runner, detail }),
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
