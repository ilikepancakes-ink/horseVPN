package com.example.client

import android.content.Intent
import android.net.VpnService
import android.os.Bundle
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private val CHANNEL = "horsevpn"

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL).setMethodCallHandler { call, result ->
            if (call.method == "startVPN") {
                val route = call.argument<String>("route")
                if (route != null) {
                    startVpnService(route)
                    result.success("VPN started")
                } else {
                    result.error("INVALID_ARGUMENT", "Route is null", null)
                }
            } else {
                result.notImplemented()
            }
        }
    }

    private fun startVpnService(route: String) {
        val intent = VpnService.prepare(this)
        if (intent != null) {
            // Request permission
            startActivityForResult(intent, 0)
        } else {
            // Permission granted, start service
            val serviceIntent = Intent(this, HorseVpnService::class.java)
            serviceIntent.putExtra("route", route)
            startService(serviceIntent)
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == 0 && resultCode == RESULT_OK) {
            // Permission granted, start service
            val route = data?.getStringExtra("route") ?: ""
            val serviceIntent = Intent(this, HorseVpnService::class.java)
            serviceIntent.putExtra("route", route)
            startService(serviceIntent)
        }
    }
}
