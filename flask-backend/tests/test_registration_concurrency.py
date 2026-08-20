import concurrent.futures
import time
import requests
import json
import uuid

SERVER_URLS = ["http://localhost:5000", "http://localhost:5001"]

def send_registration(url, event_id, user_num):
    email = f"user{user_num}_{uuid.uuid4().hex[:6]}@test.com"
    name = f"Test Participant {user_num}"
    payload = {
        "event_id": event_id,
        "email": email,
        "name": name,
        "regno": f"REG-TEST-{user_num:03d}"
    }
    try:
        response = requests.post(f"{url}/api/registrations", json=payload, timeout=10)
        return response.status_code, response.json()
    except Exception as e:
        return 500, {"success": False, "error": "CONNECTION_ERROR", "message": str(e)}

def run_concurrency_test(total_requests=120, capacity=50):
    print("=" * 70)
    print("🧪 ATOMIC CONCURRENCY TEST: EVENT REGISTRATION & CAPACITY ENFORCEMENT")
    print("=" * 70)
    print(f"Targeting active servers: {SERVER_URLS}")
    print(f"Simulating {total_requests} simultaneous registration requests for an event with capacity = {capacity}")

    # 1. Create a test event with capacity = 50
    event_payload = {
        "name": f"Concurrency Test Event {uuid.uuid4().hex[:4]}",
        "date": "2026-09-01",
        "capacity": capacity,
        "description": "Event created for concurrency testing"
    }

    primary_url = SERVER_URLS[0]
    try:
        res = requests.post(f"{primary_url}/api/events", json=event_payload, timeout=5)
        event_data = res.json().get("event", {})
        event_id = event_data.get("id")
        print(f"✅ Created Test Event: {event_data.get('name')} (ID: {event_id}) | Capacity: {capacity}")
    except Exception as e:
        print(f"❌ Failed to connect to server at {primary_url}: {e}")
        return

    # 2. Fire 120 concurrent registration requests simultaneously across servers
    print(f"🚀 Firing {total_requests} concurrent registration requests now...")

    results = []
    start_time = time.time()

    with concurrent.futures.ThreadPoolExecutor(max_workers=60) as executor:
        futures = []
        for i in range(1, total_requests + 1):
            url = SERVER_URLS[i % len(SERVER_URLS)]
            futures.append(executor.submit(send_registration, url, event_id, i))

        for future in concurrent.futures.as_completed(futures):
            results.append(future.result())

    elapsed = time.time() - start_time
    print(f"⏱️ All {total_requests} requests finished in {elapsed:.2f} seconds.")

    # 3. Analyze Results
    success_count = 0
    event_full_count = 0
    other_errors = 0

    for status_code, body in results:
        if status_code == 201 and body.get("success"):
            success_count += 1
        elif status_code == 409 and body.get("error") == "EVENT_FULL":
            event_full_count += 1
        else:
            other_errors += 1

    print("\n" + "-" * 50)
    print("📊 TEST RESULT SUMMARY")
    print("-" * 50)
    print(f"Successful Registrations (HTTP 201): {success_count} / {capacity} allowed capacity")
    print(f"Cleanly Rejected 'EVENT_FULL' (HTTP 409): {event_full_count}")
    print(f"Other Errors/Failures: {other_errors}")
    print("-" * 50)

    # 4. Strict Assertion Verification
    if success_count == capacity and (success_count + event_full_count) == total_requests:
        print(f"🎉 VERIFICATION PASSED: Exactly {success_count} registrations succeeded! Never {success_count + 1}!")
        print("Database row-level locks strictly enforced capacity across multiple concurrent servers.")
    else:
        print(f"⚠️ VERIFICATION ALERT: Expected {capacity} successes, got {success_count}.")

if __name__ == "__main__":
    run_concurrency_test(total_requests=120, capacity=50)
