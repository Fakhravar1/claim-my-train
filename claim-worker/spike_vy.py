"""Dry-run validation spike for the Vy headless worker (submit_vy).

Builds a MOCK claim + profile and drives the live Vy reimbursement form via the real worker
in DRY-RUN (live=False): it FILLS both wizard steps and screenshots, and NEVER clicks
"Bekräfta" — so nothing is ever submitted to Vy (§19 standing rule). Validates the selectors
+ the PrimeNG dropdown/calendar handling against the live form without filing anything.

Run:  python spike_vy.py            (writes a PNG to ./spike_out/)
"""
import os
from datetime import datetime, timezone

from submit_vy import submit_vy

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "spike_out")

MOCK_PROFILE = {
    "first_name": "Test", "last_name": "Testsson",
    "street_address": "Provgatan 1", "postal_code": "11122", "city": "Stockholm",
    "claim_mobile": "0701234567", "claim_email": "test@example.com",
    "payout_method": "bank", "clearing_number": "8327-9", "account_number": "1234567",
}

MOCK_CLAIM = {
    "id": "spike", "user_id": "spike", "booking_reference": "TEST123456",
    "service_number": "1043",
    "origin_stop_name": "Göteborg C", "destination_stop_name": "Stockholm C",
    "origin_scheduled": "2026-06-24T09:00:00+02:00",
    "destination_scheduled": "2026-06-24T12:10:00+02:00",
    "destination_actual": "2026-06-24T12:55:00+02:00",
    "trip_start_date": "2026-06-24", "delay_bucket": "40_59", "was_cancelled": False,
}


def main() -> int:
    os.makedirs(OUT, exist_ok=True)
    print("== vy: dry-run fill ==")
    result = submit_vy(MOCK_CLAIM, MOCK_PROFILE, live=False)  # live=False: NO submit
    if result.get("error"):
        print(f"   error: {result['error']} — {result.get('message')}")
    shot = result.get("screenshot")
    if shot:
        path = os.path.join(OUT, f"vy-{datetime.now(timezone.utc):%H%M%S}.png")
        with open(path, "wb") as f:
            f.write(shot)
        print(f"   ok -> {path} ({len(shot)} bytes)")
        return 0
    print("   WARNING: no screenshot returned")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
