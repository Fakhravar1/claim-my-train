// report-claim-canary — receives the form canary's dry-run results and emails on
// breach/recovery. The canary (claim-worker/canary.py, GitHub Actions, daily) drives each
// operator claim form in DRY-RUN (never submits, never BankID — §19) and POSTs here.
//
// BACKEND-ONLY. verify_jwt=false, but we authorize manually: the Authorization bearer must
// be a SERVICE-LEVEL key. Exact match against SUPABASE_SERVICE_ROLE_KEY first; if that
// misses (the repo secret may be the new sb_secret_… format while the edge env holds the
// legacy JWT — they authorize identically but aren't byte-equal), validate the token BY USE:
// only a service-level key can list users via the Auth admin API. A random caller can't
// spoof results or spam alerts either way.
//
// Alerting policy (via public.claim_canary_state — clone of the freshness watchdog):
//   • fires ONE email when a check first breaches,
//   • re-reminds every RENOTIFY_HOURS while still breaching,
//   • sends a recovery email when it clears.
// `reported_at` is the canary heartbeat that check_data_freshness()'s `claim_canary_ran`
// row watches (dead-canary detection rides the existing 30-min freshness cron).
//
// POST { results: [{check_name, ok, detail?}], run_url?, dryRun? }
//   dryRun:true → compute breach/recovery, but send no email and write no state.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const ALERT_EMAIL = Deno.env.get('ALERT_EMAIL') ?? 'arianfakhravar@gmail.com'
const FROM = 'Qvitta <noreply@qvitta.nu>'
const RENOTIFY_HOURS = 6

type ResultIn = { check_name: string; ok: boolean; detail?: string }
type State = {
  check_name: string
  breaching: boolean
  last_notified_at: string | null
  detail: string | null
  reported_at: string
}

async function isServiceBearer(req: Request): Promise<boolean> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return false
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

const hoursSince = (iso: string | null): number =>
  iso ? (Date.now() - new Date(iso).getTime()) / 3_600_000 : Infinity

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const sendEmail = async (subject: string, html: string) => {
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM, to: [ALERT_EMAIL], subject, html }),
  })
  if (!resp.ok) {
    console.error('Resend error', resp.status, (await resp.text()).slice(0, 300))
  }
  return resp.ok
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method', { status: 405 })
  // Backend-only: require a service-level bearer.
  if (!(await isServiceBearer(req))) return new Response('forbidden', { status: 403 })

  let results: ResultIn[] = []
  let dryRun = false
  let runUrl = ''
  try {
    const body = await req.json()
    results = Array.isArray(body.results) ? body.results : []
    dryRun = body.dryRun === true
    runUrl = typeof body.run_url === 'string' ? body.run_url : ''
  } catch {
    return new Response('bad_request', { status: 400 })
  }
  if (results.length === 0) return new Response('no_results', { status: 400 })

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)
  const { data: stateRows } = await supabase
    .from('claim_canary_state')
    .select('check_name, breaching, last_notified_at, detail, reported_at')
  const stateMap = new Map<string, State>(
    ((stateRows ?? []) as State[]).map((s) => [s.check_name, s]),
  )

  const breachMsgs: string[] = []
  const recoveryMsgs: string[] = []
  const upserts: State[] = []
  const nowIso = new Date().toISOString()

  for (const r of results) {
    if (!r.check_name) continue
    const detail = (r.detail ?? '').slice(0, 900)
    const prev = stateMap.get(r.check_name)
    if (!r.ok) {
      const firstBreach = !prev?.breaching
      const dueReminder =
        prev?.breaching && hoursSince(prev.last_notified_at) >= RENOTIFY_HOURS
      const notify = firstBreach || dueReminder
      if (notify) {
        breachMsgs.push(`<li><b>${esc(r.check_name)}</b> — ${esc(detail || 'failed')}</li>`)
      }
      upserts.push({
        check_name: r.check_name,
        breaching: true,
        last_notified_at: notify ? nowIso : (prev?.last_notified_at ?? nowIso),
        detail: detail || null,
        reported_at: nowIso,
      })
    } else {
      if (prev?.breaching) {
        recoveryMsgs.push(`<li><b>${esc(r.check_name)}</b> — back to normal.</li>`)
      }
      upserts.push({
        check_name: r.check_name,
        breaching: false,
        last_notified_at: null,
        detail: null,
        reported_at: nowIso,
      })
    }
  }

  if (!dryRun && upserts.length > 0) {
    const { error: upErr } = await supabase
      .from('claim_canary_state')
      .upsert(upserts, { onConflict: 'check_name' })
    if (upErr) console.error('state upsert error', upErr)
  }

  let emailed = false
  const wouldEmail = breachMsgs.length > 0 || recoveryMsgs.length > 0
  if (wouldEmail && !dryRun) {
    if (!RESEND_API_KEY) {
      console.error('RESEND_API_KEY missing — cannot alert')
    } else {
      const parts: string[] = []
      if (breachMsgs.length > 0) {
        parts.push(
          `<h3 style="color:#b00">⚠ Claim canary breach</h3><ul>${breachMsgs.join('')}</ul>`,
        )
        parts.push(
          `<p>A dry-run check against an operator's claim form (or the claim pipeline's ` +
            `outcome ratio) failed — the form has likely changed. Form checks map to a fix in ` +
            `<code>claim-worker/submit_*.py</code> or the matching ` +
            `<code>*-fill-script</code> edge function; see the check's detail above.</p>`,
        )
      }
      if (recoveryMsgs.length > 0) {
        parts.push(`<h3 style="color:#080">✓ Recovered</h3><ul>${recoveryMsgs.join('')}</ul>`)
      }
      if (runUrl) {
        parts.push(
          `<p><a href="${esc(runUrl)}">Actions run (screenshots under artifacts)</a></p>`,
        )
      }
      const subject =
        breachMsgs.length > 0
          ? `⚠ Qvitta claim canary: ${breachMsgs.length} check(s) failing`
          : `✓ Qvitta claim canary recovered`
      emailed = await sendEmail(subject, parts.join('\n'))
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      dryRun,
      breached: breachMsgs.length,
      recovered: recoveryMsgs.length,
      wouldEmail,
      emailed,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
})
