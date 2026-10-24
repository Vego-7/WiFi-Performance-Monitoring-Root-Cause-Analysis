import os
import platform
import subprocess
import time
import re
from datetime import datetime, timezone

from dotenv import load_dotenv
from pymongo import MongoClient

# 1. Load configuration
load_dotenv()

MONGODB_URI = os.getenv(
    "MONGODB_URL",
    "mongodb://127.0.0.1:27017/"
)
GATEWAY_IP = os.getenv("GATEWAY_IP", "192.168.1.1")
INTERNET_IP = os.getenv("INTERNET_IP", "1.1.1.1")
INTERVAL_SECONDS = int(os.getenv("INTERVAL_SECONDS", "10"))

# 2. Connect to MongoDB
client = MongoClient(
    MONGODB_URI,
    serverSelectionTimeoutMS=5000
)

db = client["wifi_monitor"]
collection = db["ping_measurements"]


def ping_host(ip):
    """Ping a host once and return its status and latency."""

    if platform.system().lower() == "windows":
        command = ["ping", "-n", "1", "-w", "2000", ip]
    else:
        command = ["ping", "-c", "1", "-W", "2", ip]

    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=4
        )

        if result.returncode != 0:
            return {
                "status": "timeout",
                "latency_ms": None
            }

        match = re.search(
            r"(?:time|เวลา)\s*[=<]\s*([\d.]+)\s*ms",
            result.stdout,
            re.IGNORECASE
        )

        latency = float(match.group(1)) if match else None

        return {
            "status": "success",
            "latency_ms": latency
        }

    except subprocess.TimeoutExpired:
        return {
            "status": "timeout",
            "latency_ms": None
        }

    except OSError as error:
        print(f"Ping command error: {error}")
        return {
            "status": "error",
            "latency_ms": None
        }


def save_measurement(target, target_type, result, timestamp):
    """Save one ping measurement to MongoDB."""

    document = {
        "timestamp": timestamp,
        "target": target,
        "target_type": target_type,
        "status": result["status"],
        "latency_ms": result["latency_ms"]
    }

    collection.insert_one(document)


def main():
    # Confirm MongoDB connection before collecting data
    client.admin.command("ping")

    # Create an index to support time-based queries
    collection.create_index([
        ("timestamp", 1)
    ])

    print("WiFi Performance Monitoring - Collector")
    print(f"Gateway: {GATEWAY_IP}")
    print(f"Internet: {INTERNET_IP}")
    print(f"Interval: {INTERVAL_SECONDS} seconds")
    print("MongoDB connected.")
    print("Press Ctrl+C to stop.\n")

    try:
        while True:
            timestamp = datetime.now(timezone.utc)

            targets = [
                (GATEWAY_IP, "gateway"),
                (INTERNET_IP, "internet")
            ]

            for ip, target_type in targets:
                result = ping_host(ip)

                print(
                    f"[{timestamp.isoformat()}] "
                    f"{target_type} {ip}: "
                    f"{result['status']}, "
                    f"latency={result['latency_ms']} ms"
                )

                save_measurement(
                    ip,
                    target_type,
                    result,
                    timestamp
                )

            print("-" * 50)
            time.sleep(INTERVAL_SECONDS)

    except KeyboardInterrupt:
        print("\nCollector stopped.")

    finally:
        client.close()


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Collector error: {error}")
        raise
