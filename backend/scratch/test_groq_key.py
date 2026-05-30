import os
import httpx
from dotenv import load_dotenv

load_dotenv(override=True)
api_key = os.getenv("GROQ_API_KEY")

print(f"Testing Groq Key: {api_key[:10]}...{api_key[-5:] if api_key else ''}")

headers = {
    "Authorization": f"Bearer {api_key}"
}

try:
    response = httpx.get("https://api.groq.com/openai/v1/models", headers=headers)
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.text}")
except Exception as e:
    print(f"Request failed: {e}")
