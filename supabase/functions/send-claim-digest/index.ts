import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// send-claim-digest — emails users a list of late departures on their MONITORED
// COMMUTE ROUTES (public.commute_routes). Invoked by pg_cron with body
// {"frequency":"daily"} (evenings) or {"frequency":"weekly"} (Sunday evenings).
// {"dryRun":true} returns what WOULD be sent without sending/logging.
//
// Per user, per route: claimable journeys (public.v_claimable_journeys, 90 d
// retention) matching (from -> to within the outbound window) OR the reverse
// within the return window, restricted to the route's monitored weekdays (ISO
// 1=Mon … 7=Sun). A missing window means that direction matches all day; an
// empty monitored_days means the route is paused. Journeys are unioned and
// deduped across a user's routes, then journeys already claimed or already
// digested (digest_log) are excluded. No new journeys -> no email.
//
// PERIOD SCOPING (origin_local_date, Stockholm calendar day):
//   daily  -> only the current Stockholm day's journeys.
//   weekly -> the trailing 7 Stockholm days (the commute week).
// This keeps each email to the period the user opted into — a daily reminder
// never dumps the whole 90 d retention backlog, and a weekly (e.g. "Sunday
// afternoon") digest covers just that week's commute. The digest_log dedupe
// still prevents re-sending an already-digested journey.
//
// v8 (2026-07-19): review URL now carries `d=<travel dates>` alongside
// `journeys=<keys>`. v_claimable_journeys became a pairing VIEW over
// fct_claimable_stop_events (storage rework): a bare journey_key filter can't
// prune its index scans and recomputes ~90 days of pairing (~6 s), while an
// origin_local_date bound prunes to the named days (sub-second). ClaimReview
// applies `d` when present; legacy links degrade to the slow path.
//
// verify_jwt=false: the cron POSTs headerless (CLAUDE.md §15/§16) — DO NOT
// re-enable JWT without adding a bearer token to the cron, or ingestion dies
// silently (cron still shows green).

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''

const APP_URL = 'https://qvitta.nu'
// Verified-domain sender (qvitta.nu verified in Resend 2026-06-18). noreply is
// send-only — replies bounce (no Inleed mailbox); set a Reply-To if that changes.
const FROM = 'Qvitta <noreply@qvitta.nu>'

const stockholmHHMM = (iso: string): string =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))
const stockholmDate = (iso: string): string =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
const stockholmDayHeader = (iso: string): string =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Stockholm', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(iso))

// Today's Stockholm calendar day as YYYY-MM-DD (matches origin_local_date).
const stockholmToday = (): string =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

// N days before a YYYY-MM-DD date string, as YYYY-MM-DD (calendar arithmetic at
// UTC noon to avoid DST edge shifts).
const minusDays = (ymd: string, n: number): string => {
  const d = new Date(`${ymd}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

// ISO weekday (1=Mon … 7=Sun) of the journey's local travel day. origin_local_date
// is the fact's grain date; noon-UTC avoids any tz shift to an adjacent day.
const isoWeekday = (j: any): number => {
  const base = j.origin_local_date ? `${j.origin_local_date}T12:00:00Z` : j.origin_scheduled
  const dow = new Date(base).getUTCDay() // 0=Sun … 6=Sat
  return dow === 0 ? 7 : dow
}

const inWindow = (hhmm: string, start: string | null, end: string | null): boolean => {
  if (!start || !end) return true // unset window = direction matches all day
  const s = start.slice(0, 5), e = end.slice(0, 5)
  return hhmm >= s && hhmm <= e
}

const esc = (v: unknown): string => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] ?? c))

const renderEmail = (journeys: any[], standingUnclaimed: number, reviewUrl: string): string => {
  // Group by Stockholm travel day, matching the claim-review page layout.
  const groups = new Map<string, any[]>()
  for (const j of journeys) {
    const key = stockholmDate(j.origin_scheduled)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(j)
  }

  const sections = [...groups.values()].map((items) => {
    const header = `
      <tr><td colspan="2" style="padding:14px 12px 4px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:#888;">${esc(stockholmDayHeader(items[0].origin_scheduled))}</td></tr>`
    const rows = items.map((j) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;">
          <strong>${esc(j.origin_stop_name)} → ${esc(j.destination_stop_name)}</strong><br/>
          <span style="color:#555;font-size:13px;">dep ${esc(stockholmHHMM(j.origin_scheduled))} · arr ${esc(stockholmHHMM(j.destination_scheduled))} → ${j.destination_actual ? esc(stockholmHHMM(j.destination_actual)) : '—'}${j.operator ? ' · ' + esc(j.operator) : ''}</span>
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:700;white-space:nowrap;">
          ${j.canceled ? 'Cancelled' : '+' + Math.round(Number(j.destination_delay_minutes ?? 0)) + ' min'}
        </td>
      </tr>`).join('')
    return header + rows
  }).join('')

  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a;">
    <h2 style="margin:24px 0 4px;">Late departures on your commute</h2>
    <p style="margin:0 0 16px;color:#555;">These departures were 20+ minutes late or cancelled. If you travelled, you can claim compensation — review and file in one click.</p>
    <table style="width:100%;border-collapse:collapse;background:#fafaf7;border:1px solid #eee;border-radius:8px;">${sections}</table>
    <p style="margin:20px 0;">
      <a href="${reviewUrl}" style="background:#1d4b3a;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">Review &amp; claim (${journeys.length})</a>
    </p>
    ${standingUnclaimed > 0 ? `<p style="color:#555;font-size:13px;">You also have ${standingUnclaimed} older unclaimed delay${standingUnclaimed === 1 ? '' : 's'} — they're included on the review page.</p>` : ''}
    <p style="color:#999;font-size:12px;margin-top:24px;">You get this because your delay digest is on. Turn it off under Settings → Commuter habits at ${APP_URL}/settings.</p>
  </div>`
}

Deno.serve(async (req) => {
  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY missing' }), { status: 500 })
  }
  const body = await req.json().catch(() => ({}))
  const frequency: string = body.frequency === 'weekly' ? 'weekly' : 'daily'
  const dryRun: boolean = Boolean(body.dryRun)

  // Period scoping by origin_local_date (Stockholm calendar day). daily = today
  // only; weekly = trailing 7 days (today and the 6 days before it).
  const today = stockholmToday()
  const sinceDate = frequency === 'weekly' ? minusDays(today, 6) : today
  const untilDate = today

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  const { data: users, error: uErr } = await db
    .from('profiles')
    .select('id, email, claim_email')
    .eq('digest_frequency', frequency)
  if (uErr) return new Response(JSON.stringify({ error: uErr.message }), { status: 500 })

  const results: any[] = []
  let emailsSent = 0

  for (const u of users ?? []) {
    const to = u.claim_email || u.email
    if (!to) { results.push({ user: u.id, skipped: 'no email' }); continue }

    const { data: routes, error: rErr } = await db
      .from('commute_routes')
      .select('from_stop_id, to_stop_id, outbound_start_time, outbound_end_time, return_start_time, return_end_time, monitored_days')
      .eq('user_id', u.id)
    if (rErr) { results.push({ user: u.id, error: rErr.message }); continue }
    if (!routes || routes.length === 0) { results.push({ user: u.id, journeys: 0, routes: 0 }); continue }

    // Gather candidate journeys across every route, deduped by journey_key.
    const candidates = new Map<string, any>()
    for (const route of routes) {
      if (!route.monitored_days || route.monitored_days.length === 0) continue
      const { data: cand, error: cErr } = await db
        .from('v_claimable_journeys')
        .select('*')
        .or(`and(origin_stop_id.eq.${route.from_stop_id},destination_stop_id.eq.${route.to_stop_id}),and(origin_stop_id.eq.${route.to_stop_id},destination_stop_id.eq.${route.from_stop_id})`)
        .gte('origin_local_date', sinceDate)
        .lte('origin_local_date', untilDate)
      if (cErr) { results.push({ user: u.id, error: cErr.message }); continue }
      for (const j of cand ?? []) {
        if (!route.monitored_days.includes(isoWeekday(j))) continue
        const hhmm = stockholmHHMM(j.origin_scheduled)
        const outbound = j.origin_stop_id === route.from_stop_id
        const ok = outbound
          ? inWindow(hhmm, route.outbound_start_time, route.outbound_end_time)
          : inWindow(hhmm, route.return_start_time, route.return_end_time)
        if (ok) candidates.set(j.journey_key, j)
      }
    }

    const inCommute = [...candidates.values()].sort((a, b) =>
      String(a.origin_scheduled).localeCompare(String(b.origin_scheduled)))
    if (inCommute.length === 0) { results.push({ user: u.id, journeys: 0 }); continue }

    const keys = inCommute.map((j) => j.journey_key)
    const [{ data: claimed }, { data: logged }] = await Promise.all([
      db.from('claims').select('journey_key').eq('user_id', u.id).in('journey_key', keys),
      db.from('digest_log').select('journey_key').eq('user_id', u.id).in('journey_key', keys),
    ])
    const claimedSet = new Set((claimed ?? []).map((r) => r.journey_key))
    const loggedSet = new Set((logged ?? []).map((r) => r.journey_key))

    const unclaimed = inCommute.filter((j) => !claimedSet.has(j.journey_key))
    const fresh = unclaimed.filter((j) => !loggedSet.has(j.journey_key))
    if (fresh.length === 0) { results.push({ user: u.id, journeys: 0, standing: unclaimed.length }); continue }

    // `d` = the distinct travel dates of the linked journeys, so ClaimReview can
    // bound the pairing-view scan to those days (see v8 header note).
    const reviewDates = [...new Set(unclaimed.map((j) => j.origin_local_date).filter(Boolean))].sort()
    const reviewUrl = `${APP_URL}/claim-review?journeys=${unclaimed.map((j) => j.journey_key).join(',')}&d=${reviewDates.join(',')}`

    if (dryRun) {
      results.push({ user: u.id, to, wouldSend: fresh.length, standing: unclaimed.length - fresh.length, routes: routes.length, sinceDate, untilDate, reviewUrl })
      continue
    }

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to: [to],
        subject: `${fresh.length} late departure${fresh.length === 1 ? '' : 's'} on your commute — claimable`,
        html: renderEmail(fresh, unclaimed.length - fresh.length, reviewUrl),
        // Tags echo back on Resend webhook events → digest_events attribution.
        tags: [{ name: 'user_id', value: u.id }, { name: 'frequency', value: frequency }],
      }),
    })
    if (!resp.ok) {
      const errBody = await resp.text()
      console.error(`Resend failed for ${u.id}:`, resp.status, errBody.slice(0, 300))
      results.push({ user: u.id, error: `resend ${resp.status}` })
      continue
    }

    const { error: logErr } = await db
      .from('digest_log')
      .upsert(fresh.map((j) => ({ user_id: u.id, journey_key: j.journey_key })), { onConflict: 'user_id,journey_key', ignoreDuplicates: true })
    if (logErr) console.error(`digest_log insert failed for ${u.id}:`, logErr.message)

    emailsSent++
    results.push({ user: u.id, sent: fresh.length, standing: unclaimed.length - fresh.length })
  }

  return new Response(
    JSON.stringify({ frequency, dryRun, sinceDate, untilDate, usersConsidered: (users ?? []).length, emailsSent, results }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
})
