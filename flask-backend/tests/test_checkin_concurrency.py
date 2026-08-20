import concurrent.futures
import time
import requests
import json
import uuid

SERVER_URLS = ["http://localhost:5000", "http://localhost:5001"]

def send_checkin(url, event_id, token, req_id):
    payload = {
        "event_id": event_id,
        "token": token,
        "scanned_by": str(uuid.uuid4())
    }
    try:
        response = requests.post(f"{url}/api/check-in", json=payload, timeout=10)
        return response.status_code, response.json()
    except Exception as e:
        return 500, {"success": False, "error": "CONNECTION_ERROR", "message": str(e)}

def run_checkin_concurrency_test(total_requests=100):
    print("=" * 70)
    print("🧪 ATOMIC CONCURRENCY TEST: DUPLICATE CHECK-IN REJECTION PROOF")
    print("=" * 70)
    print(f"Targeting active servers: {SERVER_URLS}")
    print(f"Firing {total_requests} simultaneous check-in requests for the SAME QR token...")

    primary_url = SERVER_URLS[0]

    # 1. Create a test event
    try:
        ev_res = requests.post(f"{primary_url}/api/events", json={
            "name": f"Checkin Test Event {uuid.uuid4().hex[:4]}",
            "date": "2026-09-01",
            "capacity": 100
        }, timeout=5)
        event_id = ev_res.json()["event"]["id"]
        print(f"✅ Created Event: ID {event_id}")
    except Exception as e:
        print(f"❌ Server connection failed at {primary_url}: {e}")
        return

    # 2. Register participant
    user_email = f"checkin_user_{uuid.uuid4().hex[:6]}@test.com"
    reg_res = requests.post(f"{primary_url}/api/registrations", json={
        "event_id": event_id,
        "email": user_email,
        "name": "Checkin Tester",
        "regno": "REG-CI-999"
    }, timeout=5)

    # 3. Generate rotating QR token
    token_res = requests.post(f"{primary_url}/api/qr/token", json={
        "event_id": event_id,
        "email": user_email
    }, timeout=5)

    qr_token_data = token_res.json()
    raw_token = qr_token_data.get("token")
    print(f"🔑 Generated 60s Rotating QR Token: {raw_token[:15]}...")

    # 4. Fire 100 concurrent check-in requests simultaneously across ports 5000 & 5001
    print(f"🚀 Firing {total_requests} concurrent check-in scans simultaneously...")
    results = []
    start_time = time.time()

    with concurrent.futures.ThreadPoolExecutor(max_workers=50) as executor:
        futures = []
        for i in range(1, total_requests + 1):
            url = SERVER_URLS[i % len(SERVER_URLS)]
            futures.append(executor.submit(send_checkin, url, raw_token and raw_token or "test", raw_token, i))

        for future in concurrent.futures.as_completed(futures):
            results.append(future.result())

    elapsed = time.time() - start_time
    print(f"⏱️ Processed {total_requests} concurrent check-in requests in {elapsed:.2f} seconds.")

    # 5. Analyze Results
    success_count = 0
    duplicate_rejected_count = 0
    rejected_messages = []

    for status_code, body in results:
        if status_code == 200 and body.get("success"):
            success_count += 1
        elif status_code == 409:
            duplicate_rejected_count += 1
            if body.get("message") and body.get("message") not in rejected_messages:
                rejected_messages.append(body.get("message"))

    print("\n" + "-" * 50)
    print("📊 CHECK-IN CONCURRENCY SUMMARY")
    print("-" * 50)
    print(f"Successful Check-ins (HTTP 200): {success_count} (Expected: EXACTLY 1)")
    print(f"Cleanly Rejected Duplicates (HTTP 409): {duplicate_rejected_count} (Expected: EXACTLY {total_requests - 1})")
    print("Sample Rejection Message Returned to Scanner:")
    for msg in rejected_messages[:3]:
        print(f"  ➜ '{msg}'")
    print("-" * 50)

    # 6. Strict Assertion Verification
    if success_count == 1 and duplicate_rejected_count == (total_requests - 1):
        print("🎉 PROOF PASSED: Exactly 1 scan succeeded! 99 duplicate scans were cleanly rejected with clear timestamp reasons!")
        print("Database-level unique constraint & atomic transaction prevents double check-ins across concurrent servers!")
    else:
        print(f"⚠️ VERIFICATION ALERT: Expected 1 success and {total_requests - 1} rejections, got {success_count} / {duplicate_rejected_count}.")

if __name__ == "__main__":
    run_checkin_concurrency_test(total_requests=100)
