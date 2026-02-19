import requests
import json

url = "http://127.0.0.1:8000/api/chat"
payload = {
    "message": "Hello",
    "language": "Python"
}

try:
    response = requests.post(url, json=payload)
    print(f"Status Code: {response.status_code}")
    print("Response Body:")
    print(response.text)
except Exception as e:
    print(f"Request failed: {e}")
