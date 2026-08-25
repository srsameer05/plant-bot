import express from 'express';
import cors from 'cors';
import { networkInterfaces } from 'os';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Keep track of active telemetry data
let latestTelemetry = {
  temp: 25.0,
  hum: 60.0,
  soil: 50,
  light: 50,
  expression: 'HAPPY',
  lastUpdated: new Date().toISOString(),
  deviceConnected: false
};

// History of telemetry data (limited to last 50 readings)
const telemetryHistory = [];
const MAX_HISTORY = 50;

// Track SSE client connections
let sseClients = [];

// Helper to get local network IP address
function getLocalIPAddress() {
  const nets = networkInterfaces();
  const results = [];

  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
      if (net.family === 'IPv4' && !net.internal) {
        results.push(net.address);
      }
    }
  }
  return results.length > 0 ? results[0] : 'localhost';
}

// Check device connection timeout (if no data in 15 seconds, set as disconnected)
let disconnectTimer = null;
const resetDisconnectTimer = () => {
  if (disconnectTimer) clearTimeout(disconnectTimer);
  
  latestTelemetry.deviceConnected = true;
  
  disconnectTimer = setTimeout(() => {
    latestTelemetry.deviceConnected = false;
    broadcastSSE({ type: 'deviceStatus', data: { connected: false } });
    console.log('🔌 ESP32 device disconnected (timeout)');
  }, 15000); // 15 seconds timeout
};

// Broadcast data to all SSE clients
const broadcastSSE = (message) => {
  const payload = `data: ${JSON.stringify(message)}\n\n`;
  sseClients.forEach(client => client.res.write(payload));
};

// Endpoint: ESP32 posts telemetry here
app.post('/api/telemetry', (req, res) => {
  const { temp, hum, soil, light, expression } = req.body;

  if (temp === undefined || hum === undefined || soil === undefined || light === undefined) {
    return res.status(400).json({ error: 'Missing sensor fields' });
  }

  const timestamp = new Date().toISOString();
  
  latestTelemetry = {
    temp: parseFloat(temp),
    hum: parseFloat(hum),
    soil: parseInt(soil),
    light: parseInt(light),
    expression: expression || 'HAPPY',
    lastUpdated: timestamp,
    deviceConnected: true
  };

  resetDisconnectTimer();

  // Add to history
  telemetryHistory.push({
    timestamp,
    temp: latestTelemetry.temp,
    hum: latestTelemetry.hum,
    soil: latestTelemetry.soil,
    light: latestTelemetry.light,
  });

  if (telemetryHistory.length > MAX_HISTORY) {
    telemetryHistory.shift();
  }

  // Broadcast to all active browser dashboards
  broadcastSSE({ type: 'telemetry', data: latestTelemetry, history: telemetryHistory });

  console.log(`[Telemetry] Temp: ${temp}°C | Hum: ${hum}% | Soil: ${soil}% | Light: ${light}% | Mood: ${latestTelemetry.expression}`);
  
  res.status(200).json({ status: 'ok' });
});

// Endpoint: Fetch current state and history
app.get('/api/telemetry', (req, res) => {
  res.json({
    latest: latestTelemetry,
    history: telemetryHistory
  });
});

// Endpoint: Trigger Touch Event (from Web Dashboard to ESP32 / simulated)
app.post('/api/simulator/touch', (req, res) => {
  const timestamp = new Date().toISOString();
  latestTelemetry.expression = 'TOUCH';
  latestTelemetry.lastUpdated = timestamp;
  
  broadcastSSE({ type: 'telemetry', data: latestTelemetry, history: telemetryHistory });
  console.log('👋 Simulator touch event triggered');
  res.json({ status: 'ok' });
});

// Endpoint: Server-Sent Events (SSE) stream for browsers
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const clientId = Date.now();
  const newClient = { id: clientId, res };
  sseClients.push(newClient);

  console.log(`👁️ Dashboard UI client connected (${clientId})`);

  // Send initial state immediately
  req.on('close', () => {
    sseClients = sseClients.filter(client => client.id !== clientId);
    console.log(`🔌 Dashboard UI client disconnected (${clientId})`);
  });

  const initialPayload = { type: 'init', data: latestTelemetry, history: telemetryHistory };
  res.write(`data: ${JSON.stringify(initialPayload)}\n\n`);
});

// Serve frontend in production (optional, for build verification)
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, 'dist')));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(__dirname, 'dist', 'index.html'), (err) => {
    if (err) {
      // If dist folder doesn't exist, we just let it go or return a nice message
      res.status(200).send('Developer mode active: Access React app via dev server (port 3000).');
    }
  });
});

app.listen(PORT, () => {
  const localIP = getLocalIPAddress();
  console.log('\n======================================================');
  console.log('🤖 MOA Plant Bot companion server started! 🤖');
  console.log(`🖥️  Local Dashboard: http://localhost:${PORT}`);
  console.log(`📡 ESP32 Server URL: http://${localIP}:${PORT}/api/telemetry`);
  console.log(`👉 Put this IP in your plant_bot.ino: http://${localIP}:${PORT}/api/telemetry`);
  console.log('======================================================\n');
});
