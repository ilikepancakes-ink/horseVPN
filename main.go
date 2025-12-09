package main

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"github.com/gorilla/websocket"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"strings"
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

func getLocation() (string, error) {
	resp, err := http.Get("http://ip-api.com/json/")
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	var loc struct {
		Country string `json:"country"`
	}
	err = json.NewDecoder(resp.Body).Decode(&loc)
	if err != nil {
		return "", err
	}
	return loc.Country, nil
}

func getRoute(location string) (string, error) {
	data := map[string]string{"location": location}
	jsonData, _ := json.Marshal(data)
	resp, err := http.Post("https://horse.0x409.nl/route", "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	return string(body), nil
}

func main() {
	if len(os.Args) < 2 {
		os.Exit(1)
	}
	location, err := getLocation()
	if err != nil {
		log.Fatal(err)
	}
	route, err := getRoute(location)
	if err != nil {
		log.Fatal(err)
	}
	useWS := strings.HasPrefix(route, "wss://")
	mode := os.Args[1]
	switch mode {
	case "server":
		if useWS {
			http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
				upgrader := websocket.Upgrader{}
				conn, err := upgrader.Upgrade(w, r, nil)
				if err != nil {
					return
				}
				var remoteConn Conn
				if len(os.Args) > 2 {
					wsConn, _, err := websocket.DefaultDialer.Dial(os.Args[2], nil)
					if err != nil {
						conn.Close()
						return
					}
					remoteConn = &WSConn{wsConn}
				} else {
					remoteConn = &WSConn{conn}
				}
				tunnel := &Tunnel{localConn: &WSConn{conn}, remoteConn: remoteConn}
				go tunnel.handleConnection()
			})
			log.Fatal(http.ListenAndServe(":80", nil))
		} else {
			config := &tls.Config{}
			listener, err := tls.Listen("tcp", ":443", config)
			if err != nil {
				log.Fatal(err)
			}
			defer listener.Close()
			for {
				conn, err := listener.Accept()
				if err != nil {
					continue
				}
				var remoteConn Conn
				if len(os.Args) > 2 {
					config := &tls.Config{InsecureSkipVerify: true}
					remote, err := tls.Dial("tcp", os.Args[2], config)
					if err != nil {
						conn.Close()
						continue
					}
					remoteConn = remote
				} else {
					remoteConn = conn
				}
				tunnel := &Tunnel{localConn: conn, remoteConn: remoteConn}
				go tunnel.handleConnection()
			}
		}
	case "client":
		listener, err := net.Listen("tcp", "localhost:1080")
		if err != nil {
			log.Fatal(err)
		}
		defer listener.Close()
		for {
			localConn, err := listener.Accept()
			if err != nil {
				continue
			}
			var remoteConn Conn
			if useWS {
				wsConn, _, err := websocket.DefaultDialer.Dial(route, nil)
				if err != nil {
					localConn.Close()
					continue
				}
				remoteConn = &WSConn{wsConn}
			} else {
				config := &tls.Config{InsecureSkipVerify: true}
				conn, err := tls.Dial("tcp", os.Args[2]+":443", config)
				if err != nil {
					localConn.Close()
					continue
				}
				remoteConn = conn
			}
			tunnel := &Tunnel{localConn: localConn, remoteConn: remoteConn}
			go tunnel.handleConnection()
		}
	}
}
