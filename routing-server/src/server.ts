import express from 'express';
import sqlite3 from 'sqlite3';
import axios from 'axios';
import { WebSocket } from 'ws';

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
app.use(express.json());

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
app.post('/update-servers', (req, res) => {
  try {
    const newServerList: Server[] = req.body;
    if (!Array.isArray(newServerList)) {
      return res.status(400).json({ error: 'Expected array of servers' });
    }

    serverList = newServerList;
    console.log(`Updated server list from sync server. Total servers: ${serverList.length}`);
    res.json({ status: 'updated', serverCount: serverList.length });
  } catch (error) {
    console.log('Error updating server list:', (error as Error).message);
    res.status(500).send('Internal Server Error');
  }
});

const PORT = process.env.PORT || 3000;

async function startServer() {
  await syncServerList();
  app.listen(PORT, () => {
    console.log(`Routing server listening on port ${PORT}`);
  });
}

startServer();
