import Flutter
import UIKit
import NetworkExtension

@main
@objc class AppDelegate: FlutterAppDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    GeneratedPluginRegistrant.register(with: self)

    let controller = window?.rootViewController as! FlutterViewController
    let channel = FlutterMethodChannel(name: "horsevpn", binaryMessenger: controller.binaryMessenger)
    channel.setMethodCallHandler { [weak self] (call: FlutterMethodCall, result: @escaping FlutterResult) in
      if call.method == "startVPN" {
        if let args = call.arguments as? [String: Any], let route = args["route"] as? String {
          self?.startVPN(route: route, result: result)
        } else {
          result(FlutterError(code: "INVALID_ARGUMENT", message: "Route is required", details: nil))
        }
      } else {
        result(FlutterMethodNotImplemented)
      }
    }

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  private func startVPN(route: String, result: @escaping FlutterResult) {
    let vpnManager = NEVPNManager.shared()
    vpnManager.loadFromPreferences { error in
      if let error = error {
        result(FlutterError(code: "LOAD_ERROR", message: error.localizedDescription, details: nil))
        return
      }

      let p = NEVPNProtocolIKEv2()
      p.serverAddress = "example.com"  // Need to parse route
      p.remoteIdentifier = "example.com"
      p.localIdentifier = "client"
      p.authenticationMethod = .certificate
      // Configure with certificates or shared secret

      vpnManager.protocolConfiguration = p
      vpnManager.isEnabled = true
      vpnManager.localizedDescription = "HorseVPN"

      vpnManager.saveToPreferences { error in
        if let error = error {
          result(FlutterError(code: "SAVE_ERROR", message: error.localizedDescription, details: nil))
          return
        }

        do {
          try vpnManager.connection.startVPNTunnel()
          result("VPN started")
        } catch {
          result(FlutterError(code: "START_ERROR", message: error.localizedDescription, details: nil))
        }
      }
    }
  }
}
