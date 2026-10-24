const cors = require("cors");
const express = require("express");
const { MongoClient } = require("mongodb");
const path = require("path");
require("dotenv").config({
  path: path.resolve(__dirname, "../.env"),
});

const app = express();
const PORT = process.env.PORT || 3000;

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/";

const client = new MongoClient(MONGODB_URI);

app.use(cors());
app.use(express.json());

// Test API
app.get("/", (req, res) => {
  res.json({
    message: "WiFi Monitoring API is running",
  });
});

// Get latest ping measurements
app.get("/api/ping", async (req, res) => {
  try {
    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || 50, 1),
      500
    );

    const measurements = await client
      .db("wifi_monitor")
      .collection("ping_measurements")
      .find({})
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();

    res.json({
      count: measurements.length,
      data: measurements,
    });
  } catch (error) {
    console.error("Failed to fetch ping data:", error);
    res.status(500).json({
      error: "Failed to fetch ping data",
    });
  }
});


app.get("/api/ping/latest", async (req, res) => {
  try {
    const latest = await client
      .db("wifi_monitor")
      .collection("ping_measurements")
      .aggregate([
        { $sort: { timestamp: -1 } },
        {
          $group: {
            _id: "$target_type",
            latency_ms: { $first: "$latency_ms" },
            status: { $first: "$status" },
            timestamp: { $first: "$timestamp" }
          }
        }
      ])
      .toArray();

    const response = {
      gateway: null,
      internet: null
    };

    const now = Date.now();
    const STALE_AFTER_MS = 30_000; // 30 seconds

    latest.forEach(item => {
      const timestampMs = item.timestamp
        ? new Date(item.timestamp).getTime()
        : NaN;

      const ageMs = now - timestampMs;

      let connectionStatus;

      if (!Number.isFinite(timestampMs) || ageMs < 0 || ageMs > STALE_AFTER_MS) {
        connectionStatus = "stale";
      } else if (item.status === "success") {
        connectionStatus = "online";
      } else {
        connectionStatus = "ping_failed";
      }

      response[item._id] = {
        latency_ms: item.latency_ms,
        status: item.status,
        connection_status: connectionStatus,
        timestamp: item.timestamp,
        age_seconds: Number.isFinite(ageMs)
          ? Math.floor(ageMs / 1000)
          : null
      };
    });

    res.json(response);

  } catch (error) {
    console.error("Failed to fetch latest ping:", error);
    res.status(500).json({
      error: "Failed to fetch latest ping data"
    });
  }
});

app.get("/api/ping/history", async (req, res) => {
  try {
    // Read minutes from query string; default to 30 minutes
    const minutes = Math.min(
      Math.max(parseInt(req.query.minutes, 10) || 30, 1),
      1440
    );

    // Calculate the starting time
    const since = new Date(Date.now() - minutes * 60 * 1000);

    const measurements = await client
      .db("wifi_monitor")
      .collection("ping_measurements")
      .find({
        timestamp: { $gte: since }
      })
      .sort({ timestamp: 1 })
      .toArray();

    res.json({
      minutes,
      count: measurements.length,
      data: measurements
    });
  } catch (error) {
    console.error("Failed to fetch ping history:", error);
    res.status(500).json({
      error: "Failed to fetch ping history"
    });
  }
});

app.get("/api/ping/stats", async (req, res) => {
  try {
    const minutes = Math.min(
      Math.max(parseInt(req.query.minutes, 10) || 30, 1),
      1440
    );

    const since = new Date(Date.now() - minutes * 60 * 1000);

    const stats = await client
      .db("wifi_monitor")
      .collection("ping_measurements")
      .aggregate([
        {
          $match: {
            timestamp: { $gte: since }
          }
        },
        {
          $group: {
            _id: "$target_type",
            total: { $sum: 1 },
            successful: {
              $sum: {
                $cond: [{ $eq: ["$status", "success"] }, 1, 0]
              }
            },
            failed: {
              $sum: {
                $cond: [{ $ne: ["$status", "success"] }, 1, 0]
              }
            },
            avg_latency_ms: { $avg: "$latency_ms" },
            max_latency_ms: { $max: "$latency_ms" },
            min_latency_ms: { $min: "$latency_ms" }
          }
        }
      ])
      .toArray();

    const result = {};

    for (const item of stats) {
      result[item._id] = {
        total: item.total,
        successful: item.successful,
        failed: item.failed,
        packet_loss_percent: Number(
          ((item.failed / item.total) * 100).toFixed(2)
        ),
        avg_latency_ms:
          item.avg_latency_ms === null
            ? null
            : Number(item.avg_latency_ms.toFixed(2)),
        max_latency_ms: item.max_latency_ms,
        min_latency_ms: item.min_latency_ms
      };
    }

    res.json({
      minutes,
      data: result
    });
  } catch (error) {
    console.error("Failed to calculate ping stats:", error);
    res.status(500).json({
      error: "Failed to calculate ping stats"
    });
  }
});

async function startServer() {
  try {
    // Verify that MongoDB is reachable
    await client.connect();
    await client.db("admin").command({ ping: 1 });

    console.log("Connected to MongoDB");

    app.listen(PORT, () => {
      console.log(`API running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    await client.close().catch(() => {});
    process.exitCode = 1;
  }
}

startServer();
