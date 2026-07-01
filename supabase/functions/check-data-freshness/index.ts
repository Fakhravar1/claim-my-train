import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Watchdog: reads public.check_data_freshness() and emails on breach/recovery.
// Cron-driven, headerless (verify_jwt=false). No input params, fixed recipient,
// only reads freshness + emails the owner — nothing sensitive to expose.
//
// Alerting policy (via public.data_freshness_alert_state):
//   • fires ONE email when a check first breaches,
//   • re-reminds every RENOTIFY_HOURS while still breaching,
//   • sends a recovery email when it clears.
// So a multi-hour outage = 1 alert + periodic reminders, not one per run.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const ALERT_EMAIL = Deno.env.get('ALERT_EMAIL') ?? 'arianfakhravar@gmail.com'
const FROM = 'Qvitta <noreply@qvitta.nu>'
const RENOTIFY_HOURS = 6

type Check = {
  check_name: string
  last_ingested: string | null
  age_minutes: number | null
  threshold_minutes: number
  breaching: boolean
}
type State = { check_name: string; breaching: boolean; last_notified_at: string | null }

const hoursSince = (iso: string | null): number =>
  iso ? (Date.now() - new Date(iso).getTime()) / 3_600_000 : Infinity

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

Deno.serve(async () => {
  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY missing' }), { status: 500 })
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  const { data: checks, error: rpcErr } = await supabase.rpc('check_data_freshness')
  if (rpcErr) {
    console.error('freshness rpc error', rpcErr)
    return new Response(JSON.stringify({ error: rpcErr.message }), { status: 500 })
  }

  const { data: stateRows } = await supabase
    .from('data_freshness_alert_state')
    .select('check_name, breaching, last_notified_at')
  const stateMap = new Map<string, State>((stateRows ?? []).map((s: State) => [s.check_name, s]))

  const breachMsgs: string[] = []
  const recoveryMsgs: string[] = []
  const upserts: State[] = []
  const nowIso = new Date().toISOString()

  for (const c of (checks as Check[])) {
    const prev = stateMap.get(c.check_name)
    if (c.breaching) {
      const firstBreach = !prev?.breaching
      const dueReminder = prev?.breaching && hoursSince(prev.last_notified_at) >= RENOTIFY_HOURS
      const notify = firstBreach || dueReminder
      if (notify) {
        const age = c.last_ingested
          ? `${c.age_minutes} min old (last: ${c.last_ingested})`
          : 'NO DATA AT ALL'
        breachMsgs.push(
          `<li><b>${c.check_name}</b> — stale: ${age}; threshold ${c.threshold_minutes} min.</li>`,
        )
      }
      upserts.push({
        check_name: c.check_name,
        breaching: true,
        last_notified_at: notify ? nowIso : (prev?.last_notified_at ?? nowIso),
      })
    } else {
      if (prev?.breaching) {
        recoveryMsgs.push(
          `<li><b>${c.check_name}</b> — recovered (${c.age_minutes} min old).</li>`,
        )
      }
      upserts.push({ check_name: c.check_name, breaching: false, last_notified_at: null })
    }
  }

  if (upserts.length > 0) {
    const { error: upErr } = await supabase
      .from('data_freshness_alert_state')
      .upsert(upserts, { onConflict: 'check_name' })
    if (upErr) console.error('state upsert error', upErr)
  }

  let emailed = false
  if (breachMsgs.length > 0 || recoveryMsgs.length > 0) {
    const parts: string[] = []
    if (breachMsgs.length > 0) {
      parts.push(`<h3 style="color:#b00">⚠ Data feed stale</h3><ul>${breachMsgs.join('')}</ul>`)
      parts.push(
        `<p>The scheduled ingestion for the above source(s) has stopped landing fresh rows. ` +
        `Check the collector edge function + its pg_cron job — note pg_cron can report ` +
        `“succeeded” even when the function fails (dispatch ≠ response).</p>`,
      )
    }
    if (recoveryMsgs.length > 0) {
      parts.push(`<h3 style="color:#080">✓ Recovered</h3><ul>${recoveryMsgs.join('')}</ul>`)
    }
    const subject = breachMsgs.length > 0
      ? `⚠ Qvitta data stale: ${breachMsgs.length} feed(s)`
      : `✓ Qvitta data recovered`
    emailed = await sendEmail(subject, parts.join('\n'))
  }

  return new Response(
    JSON.stringify({
      success: true,
      checks,
      breached: breachMsgs.length,
      recovered: recoveryMsgs.length,
      emailed,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
})
