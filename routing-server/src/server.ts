import express from 'express';
import sqlite3 from 'sqlite3';
import axios from 'axios';
import { WebSocket } from 'ws';
import https from 'https';
import fs from 'fs';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import crypto from 'crypto';

interface Server {
  location: string;
  url: string;
}

let serverList: Server[] = [];
const fallbackServer: Server = { location: 'default', url: 'wss://fallback.0x409.nl/' };

const cacheDb = new sqlite3.Database('./cache.db');
cacheDb.run(`CREATE TABLE IF NOT EXISTS cache (ip TEXT PRIMARY KEY, server TEXT)`);

async function syncServerList() {
  try {
    const response = await axios.get(process.env.SYNC_SERVER_URL || 'https://vpnhelper.0x409.nl/list');
    serverList = response.data as Server[];
    console.log('Synced server list from sync server');
  } catch (error) {
    console.log('Failed to sync server list, using fallback');
    serverList = [fallbackServer];
  }
}

function getServerForLocation(location: string): string {
  const server = serverList.find(s => s.location === location);
  return server ? server.url : fallbackServer.url;
}

function getCachedServer(ip: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    cacheDb.get('SELECT server FROM cache WHERE ip = ?', [ip], (err, row: any) => {
      if (err) reject(err);
      else resolve(row ? row.server : null);
    });
  });
}

function cacheServer(ip: string, server: string) {
  cacheDb.run('INSERT OR REPLACE INTO cache (ip, server) VALUES (?, ?)', [ip, server]);
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
  max: 10, // limit each IP to 10 requests per windowMs for sensitive endpoints
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);
app.use(express.json({ limit: '10mb' }));

// Authentication middleware for sensitive endpoints
const authenticateSyncServer = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  const expectedToken = process.env.SYNC_SERVER_TOKEN;

  if (!expectedToken) {
    console.warn('SYNC_SERVER_TOKEN not set - sync server authentication disabled');
    return next();
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  if (token !== expectedToken) {
    return res.status(403).json({ error: 'Invalid authentication token' });
  }

  next();
};

app.post('/route', async (req, res) => {
  const { location } = req.body;
  const ip = req.ip || req.connection.remoteAddress || 'unknown';

  try {
    let server = await getCachedServer(ip);
    if (!server) {
      server = getServerForLocation(location);
      cacheServer(ip, server);
    }
    res.send(server);
  } catch (error) {
    res.status(500).send('Internal Server Error');
  }
});

// Endpoint for sync server to push updated server list
app.post('/update-servers', strictLimiter, authenticateSyncServer, (req, res) => {
  try {
    const newServerList: Server[] = req.body;
    if (!Array.isArray(newServerList)) {
      return res.status(400).json({ error: 'Expected array of servers' });
    }

    // Validate server entries
    for (const server of newServerList) {
      if (!server.location || !server.url) {
        return res.status(400).json({ error: 'Invalid server entry: missing location or url' });
      }
      if (!server.url.startsWith('wss://') && !server.url.startsWith('ws://')) {
        return res.status(400).json({ error: 'Invalid server URL: must use ws:// or wss:// protocol' });
      }
      // Basic URL validation
      try {
        new URL(server.url);
      } catch {
        return res.status(400).json({ error: 'Invalid server URL format' });
      }
    }

    serverList = newServerList;
    console.log(`Updated server list from sync server. Total servers: ${serverList.length}`);
    res.json({ status: 'updated', serverCount: serverList.length });
  } catch (error) {
    console.log('Error updating server list:', (error as Error).message);
    res.status(500).send('Internal Server Error');
  }
});

const PORT = parseInt(process.env.PORT || '3000');
const USE_HTTPS = process.env.USE_HTTPS === 'true';
const SSL_KEY_PATH = process.env.SSL_KEY_PATH || './ssl/key.pem';
const SSL_CERT_PATH = process.env.SSL_CERT_PATH || './ssl/cert.pem';

async function startServer() {
  await syncServerList();

  if (USE_HTTPS && fs.existsSync(SSL_KEY_PATH) && fs.existsSync(SSL_CERT_PATH)) {
    try {
      const httpsOptions = {
        key: fs.readFileSync(SSL_KEY_PATH),
        cert: fs.readFileSync(SSL_CERT_PATH),
      };

      const server = https.createServer(httpsOptions, app);
      server.listen(PORT, () => {
        console.log(`Routing server listening on HTTPS port ${PORT}`);
        console.log('SSL/TLS encryption enabled');
      });
    } catch (error) {
      console.error('Failed to start HTTPS server:', error);
      console.log('Falling back to HTTP...');
      app.listen(PORT, () => {
        console.log(`Routing server listening on HTTP port ${PORT} (HTTPS failed)`);
      });
    }
  } else {
    app.listen(PORT, () => {
      console.log(`Routing server listening on HTTP port ${PORT}`);
      if (USE_HTTPS) {
        console.warn('HTTPS requested but SSL certificates not found');
      }
    });
  }
}

startServer();
