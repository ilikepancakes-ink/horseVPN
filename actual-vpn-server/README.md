# HorseVPN WebSocket Server

A WebSocket-based tunneling server for HorseVPN that receives traffic from clients and routes it to the internet.

## Features

- **WebSocket Tunneling**: Real-time bidirectional communication via WebSocket connections
- **Docker Deployment**: Containerized for easy deployment and scaling
- **Health Monitoring**: Built-in health check endpoints
- **Connection Logging**: Detailed connection logging for monitoring
- **Simple Management**: Easy-to-use management script

## Architecture

The HorseVPN system works as follows:

1. **Client** gets location and requests route from **Routing Server**
2. **Routing Server** returns WebSocket URL (e.g., `wss://your-server.com/ws`)
3. **Client** establishes VPN tunnel and sends traffic through WebSocket
4. **WebSocket Server** receives traffic and routes it to internet destinations
5. Responses flow back through the WebSocket tunnel

```
Client (VPN) <--- WebSocket ---> WebSocket Server <--- TCP/UDP ---> Internet
```

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Public IP address for client connections

### Installation

1. Navigate to the actual-vpn-server directory:
   ```bash
   cd actual-vpn-server
   ```

2. Start the WebSocket server:
   ```bash
   ./manage.sh start
   ```

3. Check server status:
   ```bash
   ./manage.sh status
   ```

4. Test WebSocket connection:
   ```bash
   ./manage.sh test
   ```

## Management Commands

The `manage.sh` script provides all server management functionality:

### Server Management
- `start`: Start the WebSocket server
- `stop`: Stop the WebSocket server
- `restart`: Restart the WebSocket server
- `status`: Show server status and health
- `logs`: View server logs
- `test`: Test WebSocket connectivity

## Network Configuration

- **WebSocket Port**: 8080 (configurable via PORT environment variable)
- **WebSocket Endpoint**: `/ws`
- **Health Check**: `/health`
- **Protocol**: WebSocket (ws://) or WSS (wss://) for TLS

## Security Features

- **WebSocket Security**: Origin checking and connection validation
- **Connection Logging**: All connections logged with timestamps
- **Health Monitoring**: Built-in health check endpoints
- **Container Security**: Non-root user execution

## Integration with Routing Server

To integrate this WebSocket server with the HorseVPN routing system:

1. **Deploy the server** on a public IP address
2. **Update routing server** database to include your server:
   ```json
   {
     "location": "your-location",
     "url": "ws://your-server-ip:8080/ws"
   }
   ```
3. **Configure TLS** (optional) for WSS connections
4. **Test connectivity** from clients

### Example Routing Server Integration

In the routing server's database, add an entry like:
```json
{
  "location": "us-east",
  "url": "ws://your-vpn-server.com:8080/ws"
}
```

## Client Connection Flow

1. Client detects location (e.g., "US")
2. Client queries routing server: `POST /route {"location": "US"}`
3. Routing server responds: `"ws://your-server.com:8080/ws"`
4. Client establishes WebSocket connection
5. Client sends IP packets through WebSocket
6. Server receives packets and forwards to internet
7. Server sends responses back through WebSocket

## Troubleshooting

### Common Issues

1. **Connection Refused**
   - Check if server is running: `./manage.sh status`
   - Verify port 8080 is accessible
   - Check firewall rules

2. **WebSocket Upgrade Failed**
   - Ensure correct WebSocket URL format
   - Check server logs for errors

3. **No Traffic Flow**
   - Verify client is sending proper IP packets
   - Check server logs for connection activity
   - Ensure server has internet access

### Logs

View server logs:
```bash
./manage.sh logs
```

### Health Checks

The server provides a health check endpoint:
```bash
curl http://localhost:8080/health
```

Expected response: `OK`

## Development

### Building from Source

```bash
# Install Go dependencies
go mod download

# Build the server
go build -o vpn-server .

# Run directly
./vpn-server
```

### Docker Build

```bash
# Build the image
docker-compose build

# Run the container
docker-compose up -d
```

### Environment Variables

- `PORT`: Server port (default: 8080)

## Deployment

### Docker Compose

```yaml
version: '3.8'
services:
  vpn-server:
    build: .
    ports:
      - "8080:8080"
    environment:
      - PORT=8080
    restart: unless-stopped
```

### Production Deployment

For production, consider:
- Using a reverse proxy (nginx) for TLS termination
- Load balancing multiple server instances
- Monitoring WebSocket connections
- Rate limiting connections

## TLS/WSS Support

To enable secure WebSocket connections (WSS):

1. **Use a reverse proxy** like nginx with TLS
2. **Configure nginx** to proxy WebSocket connections:

```nginx
server {
    listen 443 ssl;
    server_name your-server.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location /ws {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /health {
        proxy_pass http://localhost:8080/health;
    }
}
```

3. **Update routing server** to use `wss://` URLs

## Monitoring

The server provides basic monitoring through:
- Connection logs with timestamps
- Health check endpoint
- Docker container logs
- WebSocket connection status

## License

This project is part of the HorseVPN suite.

## Support

For issues and questions:
1. Check server logs: `./manage.sh logs`
2. Verify health check: `curl http://localhost:8080/health`
3. Test WebSocket connection: `./manage.sh test`
4. Check firewall and network configuration
