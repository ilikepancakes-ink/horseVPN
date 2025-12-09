import express from 'express';
import axios from 'axios';
import sqlite3 from 'sqlite3';

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
app.use(express.json());

// Get server list (for routing server)
app.get('/list', (req, res) => {
  const serverList = Array.from(servers.values()).map(server => ({
    location: server.location,
    url: server.url
  }));
  res.json(serverList);
});

// Register a new VPN server
app.post('/register', async (req, res) => {
  const { id, location, url } = req.body;

  if (!id || !location || !url) {
    return res.status(400).json({ error: 'Missing required fields: id, location, url' });
  }

  const server: Server = {
    id,
    location,
    url,
    registeredAt: Date.now(),
    lastSeen: Date.now()
  };

  servers.set(id, server);
  saveServerToDB(server);

  console.log(`Registered new server: ${id} at ${location} (${url})`);

  // Push updated server list to routing server
  await pushServerListToRoutingServer();

  res.json({ status: 'registered' });
});

// Health check endpoint for the sync server itself
app.get('/health', (req, res) => {
  res.send('OK');
});

const PORT = process.env.PORT || 3001;

async function startServer() {
  loadServersFromDB();

  // Start health checking every 5 minutes
  setInterval(healthCheck, 5 * 60 * 1000);

  app.listen(PORT, () => {
    console.log(`Sync server listening on port ${PORT}`);
    console.log(`Server list endpoint: http://localhost:${PORT}/list`);
    console.log(`Registration endpoint: http://localhost:${PORT}/register`);
  });
}

startServer();
