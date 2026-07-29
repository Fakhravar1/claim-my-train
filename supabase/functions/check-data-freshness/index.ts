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

// Event-driven investigator: on a FIRST breach, poke the Claude "Data-freshness
// breach investigator" routine (trig_01KZWTRp2T7WNdwoAB62mPBS) so an agent starts
// diagnosing immediately — same event that emails us. No-op unless both secrets
// are set, so this is safe to deploy before the token exists.
//   CLAUDE_TRIGGER_URL   = the routine's api.anthropic.com/v1/claude_code/routines/{id}/fire endpoint
//   CLAUDE_TRIGGER_TOKEN = the sk-ant-oat01 token that authorizes the fire call
const CLAUDE_TRIGGER_URL = Deno.env.get('CLAUDE_TRIGGER_URL') ?? ''
const CLAUDE_TRIGGER_TOKEN = Deno.env.get('CLAUDE_TRIGGER_TOKEN') ?? ''

// ---------------------------------------------------------------- self-heal
// SECOND LAYER of the Raspberry Pi runner failsafe (docs/pi-runner-plan.md §3).
//
// The `dispatch-workflow` router handles exactly one failure: "the Pi is offline
// at dispatch time". It does NOT handle the Pi accepting a job and then dying
// mid-run, nor the router itself failing, nor pg_cron not firing. In all of
// those, dbt simply stops running and the board goes stale — which is precisely
// what this watchdog already detects. So detection and recovery are wired
// together here: on a breach, re-dispatch dbt-run.
//
// Forced to ubuntu-latest ON PURPOSE. If the Pi and the router were both healthy
// we would not be breaching, so recovery must not be routed through either of
// them. Burning a few billed minutes to un-stick the pipeline is the trade.
//
// Only `int_stop_events` triggers it: that is the dbt-gated check. tv_raw and
// rest_raw are ingestion feeds that no dbt build can fix, and claim_canary_ran is
// unrelated — dispatching for those would burn minutes for nothing.
//
// Fires on the SAME schedule as the notification (first breach, then every
// RENOTIFY_HOURS), so a sustained outage costs ~4 hosted runs/day rather than one
// every 30 minutes. It is a self-heal, not a retry loop: if dbt is failing for a
// real reason, hammering it will not help and the emails are the escalation.
const SELF_HEAL_CHECK = 'int_stop_events'

const redispatchHosted = async (): Promise<{ ok: boolean; detail: string }> => {
  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/dispatch-workflow`, {
      method: 'POST',
      headers: {
        // dispatch-workflow accepts a service-level bearer (isServiceBearer);
        // this function already holds the service-role key, so no new secret.
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ workflow: 'dbt-run.yml', runner: 'ubuntu-latest' }),
    })
    const detail = (await resp.text()).slice(0, 300)
    if (!resp.ok) console.error('self-heal dispatch failed', resp.status, detail)
    return { ok: resp.ok, detail }
  } catch (e) {
    console.error('self-heal dispatch threw', e)
    return { ok: false, detail: String(e) }
  }
}

const fireInvestigator = async (): Promise<boolean> => {
  if (!CLAUDE_TRIGGER_URL || !CLAUDE_TRIGGER_TOKEN) return false
  try {
    const resp = await fetch(CLAUDE_TRIGGER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${CLAUDE_TRIGGER_TOKEN}`,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    })
    if (!resp.ok) {
      console.error('investigator trigger error', resp.status, (await resp.text()).slice(0, 300))
    }
    return resp.ok
  } catch (e) {
    console.error('investigator trigger threw', e)
    return false
  }
}

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
  let newBreach = false
  let selfHealNeeded = false

  for (const c of (checks as Check[])) {
    const prev = stateMap.get(c.check_name)
    if (c.breaching) {
      const firstBreach = !prev?.breaching
      if (firstBreach) newBreach = true
      const dueReminder = prev?.breaching && hoursSince(prev.last_notified_at) >= RENOTIFY_HOURS
      const notify = firstBreach || dueReminder
      if (notify) {
        const age = c.last_ingested
          ? `${c.age_minutes} min old (last: ${c.last_ingested})`
          : 'NO DATA AT ALL'
        breachMsgs.push(
          `<li><b>${c.check_name}</b> — stale: ${age}; threshold ${c.threshold_minutes} min.</li>`,
        )
        // Tied to `notify`, not to `breaching`, so the self-heal inherits the
        // same first-breach-then-every-RENOTIFY_HOURS cadence as the email.
        if (c.check_name === SELF_HEAL_CHECK) selfHealNeeded = true
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

  // Attempt recovery BEFORE composing the email, so the alert can say whether
  // a re-dispatch was kicked off and the reader is not left guessing.
  const selfHeal = selfHealNeeded ? await redispatchHosted() : null

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
      if (selfHeal) {
        parts.push(
          selfHeal.ok
            ? `<p><b>Self-heal:</b> re-dispatched <code>dbt-run</code> on <code>ubuntu-latest</code> ` +
              `(the hosted runner, deliberately bypassing the Pi and the dispatch router). ` +
              `If that build succeeds this should clear within one cycle — no action needed unless ` +
              `you get another reminder.</p>`
            : `<p><b>Self-heal FAILED</b> — could not re-dispatch <code>dbt-run</code>: ` +
              `<code>${selfHeal.detail}</code>. Run it by hand from the Actions tab, ` +
              `picking <code>ubuntu-latest</code>.</p>`,
        )
      }
    }
    if (recoveryMsgs.length > 0) {
      parts.push(`<h3 style="color:#080">✓ Recovered</h3><ul>${recoveryMsgs.join('')}</ul>`)
    }
    const subject = breachMsgs.length > 0
      ? `⚠ Qvitta data stale: ${breachMsgs.length} feed(s)`
      : `✓ Qvitta data recovered`
    emailed = await sendEmail(subject, parts.join('\n'))
  }

  // Fire the Claude investigator only on a NEW breach (not reminders/recoveries),
  // so each outage wakes an agent once. No-op unless the trigger secrets are set.
  const investigatorFired = newBreach ? await fireInvestigator() : false

  return new Response(
    JSON.stringify({
      success: true,
      checks,
      breached: breachMsgs.length,
      recovered: recoveryMsgs.length,
      emailed,
      investigatorFired,
      selfHealDispatched: selfHeal?.ok ?? false,
      selfHealDetail: selfHeal?.detail ?? null,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
})
