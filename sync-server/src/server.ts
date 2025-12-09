import express from 'express';
import axios from 'axios';
import sqlite3 from 'sqlite3';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import https from 'https';
import fs from 'fs';
import crypto from 'crypto';

interface Server {
  id: string;
  location: string;
  url: string;
  registeredAt: number;
  lastSeen: number;
}

const servers: Map<string, Server> = new Map();
const db = new sqlite3.Database('./servers.db');

db.run(`CREATE TABLE IF NOT EXISTS servers (
  id TEXT PRIMARY KEY,
  location TEXT NOT NULL,
  url TEXT NOT NULL,
  registered_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
)`);

function loadServersFromDB() {
  db.all('SELECT * FROM servers', [], (err, rows: any[]) => {
    if (err) {
      console.error('Error loading servers from DB:', err);
      return;
    }

    servers.clear();
    rows.forEach(row => {
      servers.set(row.id, {
        id: row.id,
        location: row.location,
        url: row.url,
        registeredAt: row.registered_at,
        lastSeen: row.last_seen
      });
    });
    console.log(`Loaded ${servers.size} servers from database`);
  });
}

function saveServerToDB(server: Server) {
  db.run(
    'INSERT OR REPLACE INTO servers (id, location, url, registered_at, last_seen) VALUES (?, ?, ?, ?, ?)',
    [server.id, server.location, server.url, server.registeredAt, server.lastSeen]
  );
}

function removeServerFromDB(id: string) {
  db.run('DELETE FROM servers WHERE id = ?', [id]);
}

async function pingServer(server: Server): Promise<boolean> {
  try {
    // Try to ping the health endpoint
    const healthUrl = server.url.replace('/ws', '/health').replace('ws://', 'http://').replace('wss://', 'https://');
    const response = await axios.get(healthUrl, { timeout: 5000 });
    return response.status === 200;
  } catch (error) {
    console.log(`Server ${server.id} (${server.url}) is not responding`);
    return false;
  }
}

async function pushServerListToRoutingServer() {
  try {
    const serverList = Array.from(servers.values()).map(server => ({
      location: server.location,
      url: server.url
    }));

    const routingServerUrl = process.env.ROUTING_SERVER_URL || 'https://vpnhelper.0x409.nl/update-servers';
    await axios.post(routingServerUrl, serverList);
    console.log('Pushed server list to routing server');
  } catch (error) {
    console.log('Failed to push server list to routing server:', (error as Error).message);
  }
}

async function healthCheck() {
  console.log('Starting health check...');
  const serverIds = Array.from(servers.keys());
  let serverListChanged = false;

  for (const id of serverIds) {
    const server = servers.get(id);
    if (!server) continue;

    const isAlive = await pingServer(server);
    if (isAlive) {
      server.lastSeen = Date.now();
      saveServerToDB(server);
    } else {
      console.log(`Removing dead server: ${server.id}`);
      servers.delete(id);
      removeServerFromDB(id);
      serverListChanged = true;
    }
  }

  console.log(`Health check complete. Active servers: ${servers.size}`);

  // Push updated server list to routing server if any servers were removed
  if (serverListChanged) {
    await pushServerListToRoutingServer();
  }
}

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 registration requests per windowMs
  message: 'Too many registration attempts from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);
app.use(express.json({ limit: '10mb' }));

// Get server list (for routing server)
app.get('/list', (req, res) => {
  const serverList = Array.from(servers.values()).map(server => ({
    location: server.location,
    url: server.url
  }));
  res.json(serverList);
});

// Register a new VPN server
app.post('/register', strictLimiter, async (req, res) => {
  const { id, location, url } = req.body;

  // Input validation
  if (!id || !location || !url) {
    return res.status(400).json({ error: 'Missing required fields: id, location, url' });
  }

  // Validate ID format (alphanumeric, dash, underscore only)
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    return res.status(400).json({ error: 'Invalid server ID format' });
  }

  // Validate location
  if (typeof location !== 'string' || location.length === 0 || location.length > 100) {
    return res.status(400).json({ error: 'Invalid location' });
  }

  // Validate URL format
  if (!url.startsWith('wss://') && !url.startsWith('ws://')) {
    return res.status(400).json({ error: 'Invalid URL: must use ws:// or wss:// protocol' });
  }

  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  // Check for duplicate server ID
  if (servers.has(id)) {
    return res.status(409).json({ error: 'Server ID already exists' });
  }

  // Generate secure server ID if not provided or override insecure ones
  let secureId = id;
  if (!id || id.length < 8) {
    secureId = crypto.randomBytes(16).toString('hex');
  }

  const server: Server = {
    id: secureId,
    location,
    url,
    registeredAt: Date.now(),
    lastSeen: Date.now()
  };

  servers.set(secureId, server);
  saveServerToDB(server);

  console.log(`Registered new server: ${secureId} at ${location} (${url})`);

  // Push updated server list to routing server
  await pushServerListToRoutingServer();

  res.json({ status: 'registered', serverId: secureId });
});

// Health check endpoint for the sync server itself
app.get('/health', (req, res) => {
  res.send('OK');
});

const PORT = parseInt(process.env.PORT || '3001');
const USE_HTTPS = process.env.USE_HTTPS === 'true';
const SSL_KEY_PATH = process.env.SSL_KEY_PATH || './ssl/key.pem';
const SSL_CERT_PATH = process.env.SSL_CERT_PATH || './ssl/cert.pem';

async function startServer() {
  loadServersFromDB();

  // Start health checking every 5 minutes
  setInterval(healthCheck, 5 * 60 * 1000);

  if (USE_HTTPS && fs.existsSync(SSL_KEY_PATH) && fs.existsSync(SSL_CERT_PATH)) {
    try {
      const httpsOptions = {
        key: fs.readFileSync(SSL_KEY_PATH),
        cert: fs.readFileSync(SSL_CERT_PATH),
      };

      const server = https.createServer(httpsOptions, app);
      server.listen(PORT, () => {
        console.log(`Sync server listening on HTTPS port ${PORT}`);
        console.log('SSL/TLS encryption enabled');
      });
    } catch (error) {
      console.error('Failed to start HTTPS server:', error);
      console.log('Falling back to HTTP...');
      app.listen(PORT, () => {
        console.log(`Sync server listening on HTTP port ${PORT} (HTTPS failed)`);
      });
    }
  } else {
    app.listen(PORT, () => {
      console.log(`Sync server listening on HTTP port ${PORT}`);
      if (USE_HTTPS) {
        console.warn('HTTPS requested but SSL certificates not found');
      }
    });
  }
}

startServer();
