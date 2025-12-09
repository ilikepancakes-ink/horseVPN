#!/bin/bash

# HorseVPN WebSocket Server Management Script

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_help() {
    echo "HorseVPN WebSocket Server Management Service"
    echo ""
    echo "Usage: $0 [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  start          Start the WebSocket server"
    echo "  stop           Stop the WebSocket server"
    echo "  restart        Restart the WebSocket server"
    echo "  status         Show server status"
    echo "  logs           Show server logs"
    echo "  test           Test WebSocket connection"
    echo "  help           Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 start"
    echo "  $0 status"
    echo "  $0 logs"
}

start_server() {
    echo -e "${BLUE}Starting HorseVPN WebSocket server...${NC}"

    cd "$SCRIPT_DIR"

    # Parse additional arguments for the server
    SERVER_ARGS=""
    while [[ $# -gt 0 ]]; do
        case $1 in
            --no-cloudflared|--location=*|--sync-server=*|--id=*)
                SERVER_ARGS="$SERVER_ARGS $1"
                shift
                ;;
            *)
                break
                ;;
        esac
    done

    if [ -n "$SERVER_ARGS" ]; then
        echo -e "${BLUE}Server arguments: ${YELLOW}$SERVER_ARGS${NC}"
        # For Docker, we'd need to modify the compose file or use environment variables
        # For now, just note that these arguments would be passed to the container
    fi

    docker-compose up -d

    echo -e "${GREEN}WebSocket server started!${NC}"
    echo -e "${BLUE}WebSocket endpoint: ${YELLOW}ws://localhost:8080/ws${NC}"
    echo -e "${BLUE}Health check: ${YELLOW}http://localhost:8080/health${NC}"
}

stop_server() {
    echo -e "${BLUE}Stopping WebSocket server...${NC}"

    cd "$SCRIPT_DIR"
    docker-compose down

    echo -e "${GREEN}WebSocket server stopped!${NC}"
}

restart_server() {
    echo -e "${BLUE}Restarting WebSocket server...${NC}"
    stop_server
    sleep 2
    start_server
}

show_status() {
    echo -e "${BLUE}Server Status:${NC}"
    echo

    if docker-compose ps | grep -q "Up"; then
        echo -e "${GREEN}✓ Server is running${NC}"

        # Check health endpoint
        if curl -s http://localhost:8080/health > /dev/null 2>&1; then
            echo -e "${GREEN}✓ Health check passed${NC}"
        else
            echo -e "${RED}✗ Health check failed${NC}"
        fi

        # Get container info
        CONTAINER_ID=$(docker-compose ps -q)
        if [ -n "$CONTAINER_ID" ]; then
            PORT_INFO=$(docker port "$CONTAINER_ID" 8080 2>/dev/null || echo "8080")
            echo -e "${GREEN}✓ Listening on port: ${YELLOW}$PORT_INFO${NC}"
        fi
    else
        echo -e "${RED}✗ Server is not running${NC}"
    fi

    echo
    echo -e "${BLUE}WebSocket endpoint: ${YELLOW}ws://localhost:8080/ws${NC}"
    echo -e "${BLUE}Health check: ${YELLOW}http://localhost:8080/health${NC}"
}

show_logs() {
    echo -e "${BLUE}Server logs:${NC}"
    echo
    cd "$SCRIPT_DIR"
    docker-compose logs -f --tail=50
}

test_connection() {
    echo -e "${BLUE}Testing WebSocket connection...${NC}"

    # Check if server is running
    if ! docker-compose ps | grep -q "Up"; then
        echo -e "${RED}Server is not running. Start it first with '$0 start'${NC}"
        exit 1
    fi

    # Use websocat or similar to test WebSocket connection
    if command -v websocat >/dev/null 2>&1; then
        echo -e "${BLUE}Testing with websocat...${NC}"
        echo "test message" | timeout 5 websocat ws://localhost:8080/ws 2>/dev/null || {
            echo -e "${RED}Connection test failed${NC}"
            exit 1
        }
        echo -e "${GREEN}WebSocket connection test successful!${NC}"
    elif command -v wscat >/dev/null 2>&1; then
        echo -e "${BLUE}Testing with wscat...${NC}"
        echo "test message" | timeout 5 wscat -c ws://localhost:8080/ws >/dev/null 2>&1 || {
            echo -e "${RED}Connection test failed${NC}"
            exit 1
        }
        echo -e "${GREEN}WebSocket connection test successful!${NC}"
    else
        echo -e "${YELLOW}Neither websocat nor wscat found. Installing websocat...${NC}"
        if command -v apt-get >/dev/null 2>&1; then
            sudo apt-get update && sudo apt-get install -y websocat
        elif command -v yum >/dev/null 2>&1; then
            sudo yum install -y websocat
        elif command -v brew >/dev/null 2>&1; then
            brew install websocat
        else
            echo -e "${RED}Could not install websocat. Please install it manually to test WebSocket connections.${NC}"
            echo -e "${YELLOW}You can also test manually with a WebSocket client.${NC}"
            exit 1
        fi

        # Retry test after installation
        echo "test message" | timeout 5 websocat ws://localhost:8080/ws 2>/dev/null || {
            echo -e "${RED}Connection test failed${NC}"
            exit 1
        }
        echo -e "${GREEN}WebSocket connection test successful!${NC}"
    fi
}

# Main command dispatcher
case "${1:-help}" in
    start)
        start_server
        ;;
    stop)
        stop_server
        ;;
    restart)
        restart_server
        ;;
    status)
        show_status
        ;;
    logs)
        show_logs
        ;;
    test)
        test_connection
        ;;
    help|--help|-h)
        print_help
        ;;
    *)
        echo -e "${RED}Unknown command: $1${NC}"
        echo
        print_help
        exit 1
        ;;
esac
