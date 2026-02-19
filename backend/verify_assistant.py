import requests
import json
import time

API_URL = "http://127.0.0.1:8000"

def test_api():
    print("Testing API Health...")
    try:
        r = requests.get(f"{API_URL}/health")
        print(f"Health Status: {r.status_code}")
        if r.status_code != 200:
            print("Server not healthy. Please restart backend.")
            return
    except requests.exceptions.ConnectionError:
        print("Could not connect to server. Ensure uvicorn is running.")
        return

    print("\nTesting Assistant Chat (General Mode)...")
    try:
        payload = {
            "message": "Hello, what can you do?",
            "mode": "general"
        }
        r = requests.post(f"{API_URL}/api/assistant/chat", json=payload)
        print(f"Chat Status: {r.status_code}")
        if r.status_code == 200:
            data = r.json()
            print(f"Response: {data.get('answer')[:100]}...")
        else:
            print(f"Error: {r.text}")
    except Exception as e:
        print(f"Chat failed: {e}")

    print("\nTesting Code Review Endpoint...")
    try:
        payload = {
            "code": "def foo():\n    print('hello')",
            "language": "python",
            "calculate_score": False
        }
        r = requests.post(f"{API_URL}/api/review", json=payload)
        print(f"Review Status: {r.status_code}")
        if r.status_code == 200:
            print("Review successful.")
        else:
            print(f"Review Error: {r.text}")
    except Exception as e:
        print(f"Review failed: {e}")

if __name__ == "__main__":
    test_api()
