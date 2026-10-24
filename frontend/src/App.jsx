import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import "./App.css";

const API_URL = "http://localhost:3000";


function StatusCard({ title, target, measurement }) {
  const connectionStatus = measurement?.connection_status;

  const statusInfo = {
    online: {
      label: "Online",
      className: "online",
    },
    ping_failed: {
      label: "Ping Failed",
      className: "offline",
    },
    stale: {
      label: "Unknown",
      className: "offline",
    },
  };

  const currentStatus = statusInfo[connectionStatus] ?? {
    label: "Unknown",
    className: "offline",
  };

  const latency = measurement?.latency_ms;

  return (
    <section className="status-card">
      <div className="card-heading">
        <span className="card-label">{title}</span>

        <span className={`status-badge ${currentStatus.className}`}>
          <span className="status-dot" />
          {currentStatus.label}
        </span>
      </div>

      <div className="latency-value">
        {latency == null ? "--" : latency}
        <span> ms</span>
      </div>

      <p className="target-address">{target}</p>

      <p className="card-footnote">
        {measurement?.timestamp
          ? `Last check: ${new Date(
              measurement.timestamp
            ).toLocaleTimeString("th-TH", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              hour12: false,
            })}`
          : "Waiting for measurement"}
      </p>
    </section>
  );
}


function App() {
  const [latest, setLatest] = useState(null);
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function fetchDashboardData() {
      try {
        const [latestResponse, historyResponse, statsResponse] =
          await Promise.all([
            fetch(`${API_URL}/api/ping/latest`),
            fetch(`${API_URL}/api/ping/history?minutes=30`),
            fetch(`${API_URL}/api/ping/stats?minutes=30`),
          ]);

        if (
          !latestResponse.ok ||
          !historyResponse.ok ||
          !statsResponse.ok
        ) {
          throw new Error("One or more API requests failed.");
        }

        const [latestData, historyData, statsData] = await Promise.all([
          latestResponse.json(),
          historyResponse.json(),
          statsResponse.json(),
        ]);

        if (active) {
          setLatest(latestData);
          setHistory(historyData.data);
          setStats(statsData.data);
          setError("");
        }
      } catch (err) {
        if (active) {
          setError(
            "Cannot connect to the API. Check that the backend is running."
          );
        }
      }
    }

    fetchDashboardData();

    const intervalId = setInterval(fetchDashboardData, 5000);

    return () => {
      active = false;
      clearInterval(intervalId);
    };
  }, []);



  const now = Date.now();
  const thirtyMinutesAgo = now - 30 * 60 * 1000;

  const recentHistory = history.filter((item) => {
    const timestamp = new Date(item.timestamp).getTime();

    return timestamp >= thirtyMinutesAgo && timestamp <= now;
  });


  const groupedData = Object.values(
    recentHistory.reduce((acc, item) => {
      const timestamp = new Date(item.timestamp).getTime();

      if (!acc[timestamp]) {
        acc[timestamp] = {
          timestamp,
          gateway: null,
          internet: null,
        };
      }

      if (item.target_type === "gateway") {
        acc[timestamp].gateway = item.latency_ms;
      } else if (item.target_type === "internet") {
        acc[timestamp].internet = item.latency_ms;
      }

      return acc;
    }, {})
  ).sort((a, b) => a.timestamp - b.timestamp);

  const chartData = [];

  for (let i = 0; i < groupedData.length; i++) {
    const current = groupedData[i];
    const previous = groupedData[i - 1];

    // Insert a gap if measurements are more than 20 seconds apart
    if (
      previous &&
      current.timestamp - previous.timestamp > 20_000
    ) {
      chartData.push({
        timestamp: previous.timestamp + 1,
        gateway: null,
        internet: null,
      });
    }

    chartData.push(current);
  }



  return (
    <main className="dashboard">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">NETWORK OPERATIONS</p>
          <h1>WiFi Performance</h1>
          <p className="subtitle">
            Monitor your local network and internet connectivity.
          </p>
        </div>

        <div className="refresh-indicator">
          <span className="status-dot" />
          Auto-refresh every 5 seconds
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <section className="section">
        <div className="section-heading">
          <h2>Connection Status</h2>
          <span>Latest measurements</span>
        </div>

        <div className="status-grid">
          <StatusCard
            title="Gateway"
            target="192.168.1.1"
            measurement={latest?.gateway}
          />
          <StatusCard
            title="Internet"
            target="1.1.1.1"
            measurement={latest?.internet}
          />
        </div>
      </section>

      <section className="section chart-card">
        <div className="section-heading">
          <div>
            <h2>Latency History</h2>
            <p className="subtitle">Response time over the last 30 minutes</p>
          </div>
          <span className="unit-label">Milliseconds (ms)</span>
        </div>

        {chartData.length > 0 ? (
          <div className="chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                margin={{ top: 12, right: 16, left: 4, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#293548" />
                <XAxis
                  dataKey="timestamp"
                  type="number"
                  scale="time"
                  domain={[Date.now() - 30 * 60 * 1000, Date.now()]}
                  tickFormatter={(value) =>
                    new Date(value).toLocaleTimeString("th-TH", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                      hour12: false,
                    })
                  }
                  tick={{ fill: "#9ba9bd", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickCount={7}
                  minTickGap={40}
                />
                <YAxis
                  tick={{ fill: "#9ba9bd", fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  width={48}
                  label={{
                    value: "ms",
                    angle: -90,
                    position: "insideLeft",
                    fill: "#9ba9bd",
                  }}
                />

                <Tooltip
                  labelFormatter={(value) =>
                    new Date(Number(value)).toLocaleString()
                  }
                  formatter={(value, name) => [
                    value == null ? "No data" : `${value} ms`,
                    name,
                  ]}
                  contentStyle={{
                    background: "#111a2b",
                    border: "1px solid #293548",
                    borderRadius: 10,
                  }}
                />

                <Legend />
                <Line
                  type="linear"
                  dataKey="gateway"
                  name="Gateway"
                  stroke="#43d9a3"
                  strokeWidth={2}
                  connectNulls={false}
                  dot={{ r: 3, strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                />

                <Line
                  type="linear"
                  dataKey="internet"
                  name="Internet"
                  stroke="#78a9ff"
                  strokeWidth={2}
                  connectNulls={false}
                  dot={{ r: 3, strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="empty-state">No history data available yet.</p>
        )}
      </section>

      <section className="section">
        <div className="section-heading">
          <h2>Network Statistics</h2>
          <span>Last 30 minutes</span>
        </div>

        <div className="stats-grid">
          {[
            ["Gateway", stats?.gateway],
            ["Internet", stats?.internet],
          ].map(([name, item]) => (
            <section className="stats-card" key={name}>
              <h3>{name}</h3>
              <div className="stat-row">
                <span>Average latency</span>
                <strong>
                  {item?.avg_latency_ms == null
                    ? "--"
                    : `${item.avg_latency_ms} ms`}
                </strong>
              </div>
              <div className="stat-row">
                <span>Maximum latency</span>
                <strong>
                  {item?.max_latency_ms == null
                    ? "--"
                    : `${item.max_latency_ms} ms`}
                </strong>
              </div>
              <div className="stat-row">
                <span>Packet loss</span>
                <strong>{item ? `${item.packet_loss_percent}%` : "--"}</strong>
              </div>
              <div className="stat-row">
                <span>Successful pings</span>
                <strong>
                  {item
                    ? `${item.successful} / ${item.total}`
                    : "--"}
                </strong>
              </div>
            </section>
          ))}
        </div>
      </section>

      <footer className="dashboard-footer">
        WiFi Performance Monitoring & Root Cause Analysis
      </footer>
    </main>
  );
}

export default App;