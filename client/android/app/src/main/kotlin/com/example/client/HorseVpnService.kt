package com.example.client

import android.net.VpnService
import android.os.ParcelFileDescriptor
import java.io.FileInputStream
import java.io.FileOutputStream
import java.net.InetSocketAddress
import java.nio.ByteBuffer
import java.nio.channels.SocketChannel

class HorseVpnService : VpnService() {

    private var vpnInterface: ParcelFileDescriptor? = null

    override fun onStartCommand(intent: android.content.Intent?, flags: Int, startId: Int): Int {
        val route = intent?.getStringExtra("route") ?: return START_NOT_STICKY

        // Start VPN
        val builder = Builder()
            .addAddress("10.0.0.2", 24)
            .addRoute("0.0.0.0", 0)
            .addDnsServer("8.8.8.8")
            .setSession("HorseVPN")

        vpnInterface = builder.establish()

        // Start tunnel thread
        Thread {
            runTunnel(route)
        }.start()

        return START_STICKY
    }

    private fun runTunnel(route: String) {
        val vpnFileDescriptor = vpnInterface ?: return

        val inputStream = FileInputStream(vpnFileDescriptor.fileDescriptor)
        val outputStream = FileOutputStream(vpnFileDescriptor.fileDescriptor)

        // Connect to WebSocket server
        // For simplicity, assume route is wss://host:port/path
        // But in Android, WebSocket is not direct, need to use OkHttp or something
        // For demo, use SocketChannel to connect to host/port

        val uri = java.net.URI(route)
        val host = uri.host
        val port = if (uri.port == -1) 443 else uri.port

        val channel = SocketChannel.open()
        channel.connect(InetSocketAddress(host, port))

        // TLS handshake if wss
        // This is simplified, real implementation needs proper WebSocket over TLS

        val buffer = ByteBuffer.allocate(4096)

        // Read from VPN and send to WS
        Thread {
            try {
                while (true) {
                    val length = inputStream.read(buffer.array())
                    if (length > 0) {
                        buffer.limit(length)
                        channel.write(buffer)
                        buffer.clear()
                    }
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }.start()

        // Read from WS and send to VPN
        Thread {
            try {
                while (true) {
                    val bytesRead = channel.read(buffer)
                    if (bytesRead > 0) {
                        outputStream.write(buffer.array(), 0, bytesRead)
                        buffer.clear()
                    }
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }.start()
    }

    override fun onDestroy() {
        vpnInterface?.close()
        super.onDestroy()
    }
}
