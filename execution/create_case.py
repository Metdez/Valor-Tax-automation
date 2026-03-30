"""Create a case in IRS Logics via the V4 API."""

import os
import sys
import json
import requests
from dotenv import load_dotenv

load_dotenv()

PUBLIC_KEY = os.getenv("IRS_LOGICS_PUBLIC_KEY")
SECRET_KEY = os.getenv("IRS_LOGICS_SECRET_KEY")
URL = "https://valortax.irslogics.com/publicapi/V4/Case/CaseFile"


def create_case(payload: dict) -> dict:
    headers = {
        "Content-Type": "application/json",
    }
    response = requests.post(URL, headers=headers, json=payload, auth=(PUBLIC_KEY, SECRET_KEY))
    if not response.ok:
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text}")
        response.raise_for_status()
    return response.json()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python create_case.py '<json_payload>'")
        sys.exit(1)

    payload = json.loads(sys.argv[1])
    result = create_case(payload)
    print(json.dumps(result, indent=2))
