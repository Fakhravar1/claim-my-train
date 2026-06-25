"""Dry-run validation spike for the respons web-form workers (Hallandstrafiken + Kalmar).

Builds a MOCK claim + profile and drives each live form via the real worker in DRY-RUN
(live=False): it FILLS the form and screenshots it, and NEVER ticks consent or clicks submit
— so nothing is ever submitted to the operators. This validates the selectors + the
AutoPostBack handling against the live forms without filing anything (§19 standing rule).

Run:  python spike_respons.py            (writes PNGs to ./spike_out/)
CI:   .github/workflows/respons-spike.yml (workflow_dispatch, uploads them as artifacts)
"""
import os
from datetime import datetime, timezone

from submit_hallandstrafiken import submit_hallandstrafiken
from submit_kalmar import submit_kalmar

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "spike_out")

# Clearly-fake person; valid formats so the fields accept the values. Dry-run never submits.
MOCK_PROFILE = {
    "first_name": "Test", "last_name": "Testsson",
    "street_address": "Provgatan 1", "postal_code": "30240", "city": "Halmstad",
    "claim_mobile": "0701234567", "claim_email": "test@example.com",
    "claim_personnummer": "198001019812", "claim_ticket_id": "TESTAPP123",
    "payout_method": "bank", "clearing_number": "8327-9", "account_number": "1234567",
}

# (operator, submit_fn, mock journey) — a plausible route inside each authority's area.
CASES = [
    ("hallandstrafiken", submit_hallandstrafiken, {
        "origin_stop_name": "Halmstad C", "destination_stop_name": "Halmstad Öster",
        "origin_scheduled": "2026-06-24T08:00:00+02:00",
        "destination_scheduled": "2026-06-24T08:25:00+02:00",
        "destination_actual": "2026-06-24T08:50:00+02:00",
        "trip_start_date": "2026-06-24", "delay_bucket": "20_39", "booking_reference": "TESTAPP123",
    }),
    ("kalmar", submit_kalmar, {
        "origin_stop_name": "Kalmar C", "destination_stop_name": "Nybro",
        "origin_scheduled": "2026-06-24T09:00:00+02:00",
        "destination_scheduled": "2026-06-24T09:30:00+02:00",
        "destination_actual": "2026-06-24T10:05:00+02:00",
        "trip_start_date": "2026-06-24", "delay_bucket": "20_39", "booking_reference": "TESTAPP123",
    }),
]


def main() -> int:
    os.makedirs(OUT, exist_ok=True)
    failures = 0
    for name, fn, journey in CASES:
        print(f"== {name}: dry-run fill ==")
        try:
            result = fn(journey, MOCK_PROFILE, live=False)  # live=False: fills, screenshots, NO submit
            shot = result.get("screenshot")
            if shot:
                path = os.path.join(OUT, f"{name}-{datetime.now(timezone.utc):%H%M%S}.png")
                with open(path, "wb") as f:
                    f.write(shot)
                print(f"   ok -> {path} ({len(shot)} bytes)")
            else:
                print("   WARNING: no screenshot returned")
                failures += 1
        except Exception as e:
            print(f"   ERROR: {e}")
            failures += 1
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
