"""Overlay claim + profile data onto the Skånetrafiken reklamation form.

pdfplumber y is measured from the page TOP; reportlab y from the page BOTTOM.
A4 = 595.276 x 841.89. Coordinates below were measured from template.pdf.
Returns the filled PDF as bytes (no temp file).
"""
import io
import os
from datetime import datetime
from zoneinfo import ZoneInfo

from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from pypdf import PdfReader, PdfWriter

HERE = os.path.dirname(os.path.abspath(__file__))
TEMPLATE = os.path.join(HERE, "template.pdf")
PAGE_W, PAGE_H = 595.276, 841.89
STHLM = ZoneInfo("Europe/Stockholm")

# delay_bucket value (from useStartClaim) -> (x, y_top) of its checkbox
DELAY_BUCKET_XY = {
    "20_39":    (35, 324),
    "40_59":    (35, 336),
    "60_119":   (121, 324),
    "120_plus": (121, 336),
}
# payout_method value -> (x, y_top) of its checkbox
PAYOUT_XY = {
    "sms":   (35, 378),   # Värdekod via SMS
    "email": (35, 390),   # Värdekod via e-post
    "bank":  (35, 402),   # Utbetalning svensk bank
}


def _parse_ts(s):
    """Supabase timestamptz string -> aware datetime in Stockholm local time."""
    if not s:
        return None
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    return datetime.fromisoformat(s).astimezone(STHLM)


def _fmt_date(dt):
    return dt.strftime("%Y-%m-%d") if dt else ""


def _fmt_time(dt):
    return dt.strftime("%H:%M") if dt else ""


def fill(claim: dict, profile: dict) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    c.setFillColorRGB(0.10, 0.30, 0.85)  # blue, to distinguish from printed labels

    def y_to_baseline(y_top, size):
        return PAGE_H - y_top - size * 0.45

    def draw(x, y_top, text, size=9):
        if text is None:
            return
        c.setFont("Helvetica", size)
        c.drawString(x, y_to_baseline(y_top, size), str(text))

    def boxed(left_edge, y_top, text, pitch, size=10):
        """One char per cell, centred. left_edge = inner-left of cell 0."""
        if not text:
            return
        c.setFont("Helvetica", size)
        baseline = y_to_baseline(y_top, size) - size * 0.5
        for i, ch in enumerate(str(text)):
            c.drawCentredString(left_edge + pitch * (i + 0.5), baseline, ch)

    # Derive travel times/date from the journey snapshot on the claim.
    origin_dt = _parse_ts(claim.get("origin_scheduled"))
    dest_dt = _parse_ts(claim.get("destination_scheduled"))
    travel_date = _fmt_date(origin_dt) or str(claim.get("trip_start_date") or "")

    # --- Boxed fields ---
    boxed(28.6, 69,  profile.get("claim_personnummer", ""), pitch=13.79)   # Personnummer (13 cells)
    boxed(28.6, 156, profile.get("claim_ticket_id", ""),    pitch=26.41)   # BiljettID (10 cells)
    boxed(28.6, 201, "",                                     pitch=20.32)   # Reskortsnummer (not collected)
    boxed(302.1, 156, travel_date,                          pitch=19.39)   # Datum för resa (10 cells)

    # --- Personal details (free text) ---
    draw(210, 77,  profile.get("first_name", ""))
    draw(389, 77,  profile.get("last_name", ""))
    draw(31,  99,  profile.get("street_address", ""))
    draw(210, 99,  profile.get("postal_code", ""))
    draw(300, 99,  profile.get("city", ""))
    draw(427, 99,  "Sverige")
    draw(31,  122, profile.get("claim_mobile", ""))
    draw(210, 119, profile.get("claim_email", ""))

    # --- Jag skulle resa (the delayed journey) ---
    draw(499, 160, "—")                                     # Ev busslinje (n/a for train)
    draw(305, 183, claim.get("origin_stop_name", ""))
    draw(499, 183, _fmt_time(origin_dt))
    draw(305, 207, claim.get("destination_stop_name", ""))
    draw(499, 207, _fmt_time(dest_dt))

    # --- Planned transfer (not modelled yet) ---
    for y in (229, 252, 275):
        draw(499, y, "—")
    for y in (252, 275):
        draw(305, y, "—")

    # --- Delay bucket checkbox ---
    xy = DELAY_BUCKET_XY.get(claim.get("delay_bucket"))
    if xy:
        draw(xy[0], xy[1], "X")

    # --- "Jag vill ha ersättning för: prisavdrag" (always, for this MVP) ---
    draw(235, 324.5, "X")

    # --- Payout method ---
    pxy = PAYOUT_XY.get(profile.get("payout_method"))
    if pxy:
        draw(pxy[0], pxy[1], "X")

    # --- Consent boxes (measured rect centres) ---
    draw(31,  527, "X")   # Jag intygar att uppgifterna är sanningsenliga
    draw(233, 527, "X")   # Jag har läst villkoren och accepterar dem

    c.save()
    buf.seek(0)

    base = PdfReader(TEMPLATE)
    overlay = PdfReader(buf)
    writer = PdfWriter()
    page = base.pages[0]
    page.merge_page(overlay.pages[0])
    writer.add_page(page)

    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()