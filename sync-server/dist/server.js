"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const axios_1 = __importDefault(require("axios"));
const sqlite3_1 = __importDefault(require("sqlite3"));
const servers = new Map();
const db = new sqlite3_1.default.Database('./servers.db');
db.run(`CREATE TABLE IF NOT EXISTS servers (
  id TEXT PRIMARY KEY,
  location TEXT NOT NULL,
  url TEXT NOT NULL,
  registered_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
)`);
function loadServersFromDB() {
    db.all('SELECT * FROM servers', [], (err, rows) => {
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
function saveServerToDB(server) {
    db.run('INSERT OR REPLACE INTO servers (id, location, url, registered_at, last_seen) VALUES (?, ?, ?, ?, ?)', [server.id, server.location, server.url, server.registeredAt, server.lastSeen]);
}
function removeServerFromDB(id) {
    db.run('DELETE FROM servers WHERE id = ?', [id]);
}
async function pingServer(server) {
    try {
        // Try to ping the health endpoint
        const healthUrl = server.url.replace('/ws', '/health').replace('ws://', 'http://').replace('wss://', 'https://');
        const response = await axios_1.default.get(healthUrl, { timeout: 5000 });
        return response.status === 200;
    }
    catch (error) {
        console.log(`Server ${server.id} (${server.url}) is not responding`);
        return false;
    }
}
async function healthCheck() {
    console.log('Starting health check...');
    const serverIds = Array.from(servers.keys());
    for (const id of serverIds) {
        const server = servers.get(id);
        if (!server)
            continue;
        const isAlive = await pingServer(server);
        if (isAlive) {
            server.lastSeen = Date.now();
            saveServerToDB(server);
        }
        else {
            console.log(`Removing dead server: ${server.id}`);
            servers.delete(id);
            removeServerFromDB(id);
        }
    }
    console.log(`Health check complete. Active servers: ${servers.size}`);
}
const app = (0, express_1.default)();
app.use(express_1.default.json());
// Get server list (for routing server)
app.get('/list', (req, res) => {
    const serverList = Array.from(servers.values()).map(server => ({
        location: server.location,
        url: server.url
    }));
    res.json(serverList);
});
// Register a new VPN server
app.post('/register', (req, res) => {
    const { id, location, url } = req.body;
    if (!id || !location || !url) {
        return res.status(400).json({ error: 'Missing required fields: id, location, url' });
    }
    const server = {
        id,
        location,
        url,
        registeredAt: Date.now(),
        lastSeen: Date.now()
    };
    servers.set(id, server);
    saveServerToDB(server);
    console.log(`Registered new server: ${id} at ${location} (${url})`);
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
//# sourceMappingURL=server.js.map