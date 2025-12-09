package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gorilla/websocket"
)

type Conn interface {
	Read(b []byte) (int, error)
	Write(b []byte) (int, error)
	Close() error
}

type WSConn struct {
	*websocket.Conn
}

func (w *WSConn) Read(b []byte) (int, error) {
	_, data, err := w.Conn.ReadMessage()
	if err != nil {
		return 0, err
	}
	copy(b, data)
	return len(data), nil
}

func (w *WSConn) Write(b []byte) (int, error) {
	err := w.Conn.WriteMessage(websocket.BinaryMessage, b)
	if err != nil {
		return 0, err
	}
	return len(b), nil
}

func (w *WSConn) Close() error {
	return w.Conn.Close()
}

type Tunnel struct {
	localConn  Conn
	remoteConn Conn
}

func (t *Tunnel) handleConnection() {
	defer t.localConn.Close()
	defer t.remoteConn.Close()
	go t.copyData(t.localConn, t.remoteConn)
	t.copyData(t.remoteConn, t.localConn)
}

func (t *Tunnel) copyData(src, dst Conn) {
	buf := make([]byte, 4096)
	for {
		n, err := src.Read(buf)
		if err != nil {
			return
		}
		_, err = dst.Write(buf[:n])
		if err != nil {
			return
		}
	}
}

func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	upgrader := websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			return true // Allow all origins for now
		},
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade failed: %v", err)
		return
	}

	log.Printf("New WebSocket connection from %s", r.RemoteAddr)

	// Create WebSocket connection wrapper
	wsConn := &WSConn{conn}

	// For now, we'll create a simple echo server (tunnel to itself)
	// In a real implementation, this would parse IP packets and route them
	tunnel := &Tunnel{
		localConn:  wsConn,
		remoteConn: wsConn, // Echo back for now
	}

	go tunnel.handleConnection()
}

type ServerRegistration struct {
	ID      string `json:"id"`
	Location string `json:"location"`
	URL     string `json:"url"`
}

func getCloudflaredDomain() (string, error) {
	// Try to get cloudflared tunnel info
	resp, err := http.Get("http://localhost:4040/api/tunnels")
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var result struct {
		Tunnels []struct {
			Name      string `json:"name"`
			PublicURL string `json:"public_url"`
		} `json:"tunnels"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}

	// Find the tunnel for our service
	for _, tunnel := range result.Tunnels {
		if strings.Contains(tunnel.Name, "horsevpn") || strings.Contains(tunnel.Name, "vpn") {
			return tunnel.PublicURL, nil
		}
	}

	// If no specific tunnel found, return the first one
	if len(result.Tunnels) > 0 {
		return result.Tunnels[0].PublicURL, nil
	}

	return "", fmt.Errorf("no cloudflared tunnel found")
}

func registerWithSyncServer(serverID, location, url, syncServerURL string) error {
	reg := ServerRegistration{
		ID:       serverID,
		Location: location,
		URL:      url,
	}

	data, err := json.Marshal(reg)
	if err != nil {
		return err
	}

	resp, err := http.Post(syncServerURL+"/register", "application/json", bytes.NewBuffer(data))
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("registration failed with status: %d", resp.StatusCode)
	}

	log.Printf("Successfully registered with sync server: %s at %s", serverID, location)
	return nil
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("OK"))
}

func main() {
	var noCloudflared = flag.Bool("no-cloudflared", false, "Skip waiting for cloudflared domain")
	var location = flag.String("location", "unknown", "Server location")
	var syncServer = flag.String("sync-server", "https://vpnmanager.0x409.nl", "Sync server URL")
	var serverID = flag.String("id", "", "Server ID (auto-generated if empty)")
	flag.Parse()

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	// Generate server ID if not provided
	if *serverID == "" {
		hostname, err := os.Hostname()
		if err != nil {
			hostname = "unknown"
		}
		*serverID = fmt.Sprintf("%s-%d", hostname, time.Now().Unix())
	}

	http.HandleFunc("/ws", handleWebSocket)
	http.HandleFunc("/health", handleHealth)

	server := &http.Server{Addr: ":" + port}

	// Start server in background
	go func() {
		log.Printf("HorseVPN WebSocket server starting on port %s", port)
		log.Printf("WebSocket endpoint: ws://localhost:%s/ws", port)
		log.Printf("Health check: http://localhost:%s/health", port)

		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal("Server failed to start:", err)
		}
	}()

	// Wait for server to be ready
	time.Sleep(2 * time.Second)

	var domain string
	if *noCloudflared {
		// Use localhost if no cloudflared
		domain = fmt.Sprintf("ws://localhost:%s/ws", port)
		log.Printf("Skipping cloudflared, using localhost domain: %s", domain)
	} else {
		// Wait for cloudflared domain
		log.Printf("Waiting for cloudflared domain...")
		for {
			d, err := getCloudflaredDomain()
			if err != nil {
				log.Printf("Waiting for cloudflared tunnel: %v", err)
				time.Sleep(5 * time.Second)
				continue
			}
			domain = strings.Replace(d, "https://", "wss://", 1)
			domain = strings.Replace(domain, "http://", "ws://", 1)
			domain += "/ws"
			log.Printf("Cloudflared domain detected: %s", domain)
			break
		}
	}

	// Register with sync server
	for {
		err := registerWithSyncServer(*serverID, *location, domain, *syncServer)
		if err != nil {
			log.Printf("Failed to register with sync server: %v, retrying...", err)
			time.Sleep(10 * time.Second)
			continue
		}
		break
	}

	// Keep server running
	select {}
}
