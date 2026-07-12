// fire-claude-investigator — relays "something broke" events to the Claude
// "Data-freshness breach investigator" routine (trig_01KZWTRp2T7WNdwoAB62mPBS)
// so an agent starts diagnosing immediately. First consumer: the dbt-run GitHub
// Actions workflow's `if: failure()` step (a failing dbt test SKIPs every
// downstream mart, so v_journeys / v_claimable_journeys stop refreshing while
// CI is red — the freshness watchdog can't see that, because raw ingestion and
// int_stop_events stay fresh; this relay closes that alerting gap).
//
// BACKEND-ONLY. verify_jwt=false, but authorized manually with the same
// isServiceBearer pattern as report-claim-canary / send-claim-outcome: the
// bearer must be a service-level key (exact match against
// SUPABASE_SERVICE_ROLE_KEY first, else validated BY USE against the Auth
// admin API — the GitHub repo secret and the edge env may hold the same
// privilege in different key formats).
//
// Reuses the routine-fire credentials already in the edge env (set for
// check-data-freshness): CLAUDE_TRIGGER_URL + CLAUDE_TRIGGER_TOKEN. The `text`
// in the request body is forwarded to the fire API as an appended user turn so
// the investigator session knows what actually happened (e.g. a CI failure vs
// a freshness breach); if the fire API rejects the extra field we retry bare.
//
// Debounce: at most one fire per `key` per DEBOUNCE_HOURS (state in
// public.investigator_fire_state), so an hourly-failing workflow wakes ONE
// agent per incident, not one per run. `force: true` bypasses.
//
// POST { text?, key?, dryRun?, force? }
//   dryRun:true → report whether the trigger credentials are configured,
//                 fire nothing, write no state.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const CLAUDE_TRIGGER_URL = Deno.env.get('CLAUDE_TRIGGER_URL') ?? ''
const CLAUDE_TRIGGER_TOKEN = Deno.env.get('CLAUDE_TRIGGER_TOKEN') ?? ''
const DEBOUNCE_HOURS = 6

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

const fireRoutine = async (text: string): Promise<{ ok: boolean; status: number }> => {
  const headers = {
    Authorization: `Bearer ${CLAUDE_TRIGGER_TOKEN}`,
    'anthropic-version': '2023-06-01',
    'Content-Type': 'application/json',
  }
  let resp = await fetch(CLAUDE_TRIGGER_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(text ? { text } : {}),
  })
  // If the fire API rejects the appended-text field, fall back to a bare fire —
  // waking the agent without context beats not waking it.
  if (!resp.ok && text && resp.status === 400) {
    console.error('fire with text rejected', resp.status, (await resp.text()).slice(0, 300))
    resp = await fetch(CLAUDE_TRIGGER_URL, { method: 'POST', headers, body: '{}' })
  }
  if (!resp.ok) {
    console.error('routine fire error', resp.status, (await resp.text()).slice(0, 300))
  }
  return { ok: resp.ok, status: resp.status }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method', { status: 405 })
  if (!(await isServiceBearer(req))) return new Response('forbidden', { status: 403 })

  let text = ''
  let key = 'default'
  let dryRun = false
  let force = false
  try {
    const body = await req.json()
    text = typeof body.text === 'string' ? body.text.slice(0, 8000) : ''
    key = typeof body.key === 'string' && body.key ? body.key.slice(0, 100) : 'default'
    dryRun = body.dryRun === true
    force = body.force === true
  } catch {
    return new Response('bad_request', { status: 400 })
  }

  const configured = Boolean(CLAUDE_TRIGGER_URL && CLAUDE_TRIGGER_TOKEN)
  if (dryRun) {
    return new Response(JSON.stringify({ success: true, dryRun: true, configured }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  if (!configured) {
    return new Response(
      JSON.stringify({ success: false, error: 'CLAUDE_TRIGGER_URL / CLAUDE_TRIGGER_TOKEN not set' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)

  if (!force) {
    const { data: state } = await supabase
      .from('investigator_fire_state')
      .select('last_fired_at')
      .eq('fire_key', key)
      .maybeSingle()
    const last = state?.last_fired_at ? new Date(state.last_fired_at).getTime() : 0
    if (Date.now() - last < DEBOUNCE_HOURS * 3_600_000) {
      return new Response(
        JSON.stringify({ success: true, fired: false, skipped: 'debounced', key }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }
  }

  const { ok, status } = await fireRoutine(text)
  if (ok) {
    const { error: upErr } = await supabase
      .from('investigator_fire_state')
      .upsert({ fire_key: key, last_fired_at: new Date().toISOString() }, { onConflict: 'fire_key' })
    if (upErr) console.error('state upsert error', upErr)
  }

  return new Response(
    JSON.stringify({ success: ok, fired: ok, fireStatus: status, key }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
})
