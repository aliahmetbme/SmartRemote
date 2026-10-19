import Foundation
import React

@objc(UdpSocketModule)
class UdpSocketModule: RCTEventEmitter {
  override static func requiresMainQueueSetup() -> Bool {
    return false
  }

  override func supportedEvents() -> [String]! {
    return ["onUdpMessage", "onUdpError"]
  }

  @objc(isAvailable:rejecter:)
  func isAvailable(_ resolve: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
    // SSDP UDP multicast reception on iOS requires the restricted Apple entitlement
    // com.apple.developer.networking.multicast. In development/standard provisioning,
    // this entitlement is not available, so automatic SSDP is safely reported unavailable.
    resolve(false)
  }

  @objc(bind:resolver:rejecter:)
  func bind(_ port: NSNumber, resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
    rejecter(
      "MULTICAST_ENTITLEMENT_REQUIRED",
      "SSDP UDP multicast discovery on iOS requires the restricted com.apple.developer.networking.multicast entitlement. Please use manual IP connection.",
      nil
    )
  }

  @objc(send:port:address:resolver:rejecter:)
  func send(_ message: String, port: NSNumber, address: String, resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
    rejecter(
      "MULTICAST_ENTITLEMENT_REQUIRED",
      "SSDP UDP multicast discovery on iOS requires the restricted com.apple.developer.networking.multicast entitlement. Please use manual IP connection.",
      nil
    )
  }

  @objc(close:rejecter:)
  func close(_ resolve: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
    resolve(nil)
  }
}
