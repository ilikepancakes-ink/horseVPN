package main

import (
	"log"
	"net/http"
	"os"

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

func handleHealth(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("OK"))
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	http.HandleFunc("/ws", handleWebSocket)
	http.HandleFunc("/health", handleHealth)

	log.Printf("HorseVPN WebSocket server starting on port %s", port)
	log.Printf("WebSocket endpoint: ws://localhost:%s/ws", port)
	log.Printf("Health check: http://localhost:%s/health", port)

	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatal("Server failed to start:", err)
	}
}
