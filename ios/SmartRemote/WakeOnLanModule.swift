import Foundation
import React

@objc(WakeOnLanModule)
class WakeOnLanModule: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool {
    return false
  }

  @objc(isAvailable:rejecter:)
  func isAvailable(_ resolve: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
    resolve(true)
  }

  @objc(sendMagicPacket:options:resolver:rejecter:)
  func sendMagicPacket(
    _ macAddress: String,
    options: NSDictionary?,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.global(qos: .userInitiated).async {
      // 1. Validate and extract 6 raw MAC bytes
      guard let macBytes = self.parseMacAddress(macAddress) else {
        reject("INVALID_MAC", "Invalid MAC address format: '\(macAddress)'", nil)
        return
      }

      // 2. Build 102-byte Magic Packet: 6 bytes 0xFF followed by 16 repetitions of 6-byte MAC
      var packet = [UInt8](repeating: 0xFF, count: 6)
      for _ in 0..<16 {
        packet.append(contentsOf: macBytes)
      }
      guard packet.count == 102 else {
        reject("PACKET_ERROR", "Magic packet length was \(packet.count), expected 102 bytes", nil)
        return
      }

      // 3. Extract options
      let port = (options?["port"] as? NSNumber)?.intValue ?? 9
      let rawRepeat = (options?["repeatCount"] as? NSNumber)?.intValue ?? 3
      let repeatCount = min(max(rawRepeat, 1), 5)
      let rawDelay = (options?["delayMs"] as? NSNumber)?.intValue ?? 50
      let delayMs = min(max(rawDelay, 10), 500)

      // 4. Resolve broadcast destinations
      var destinations: [String] = []
      if let customBroadcast = options?["broadcastAddress"] as? String, !customBroadcast.isEmpty {
        destinations.append(customBroadcast)
      } else {
        let subnetBroadcasts = self.getLocalSubnetBroadcastAddresses()
        if !subnetBroadcasts.isEmpty {
          destinations.append(contentsOf: subnetBroadcasts)
        }
        if !destinations.contains("255.255.255.255") {
          destinations.append("255.255.255.255")
        }
      }

      // 5. Create BSD UDP socket with SO_BROADCAST enabled
      let sock = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP)
      if sock < 0 {
        let errStr = String(cString: strerror(errno))
        reject("SOCKET_CREATE_FAILED", "Failed to create UDP socket: \(errStr)", nil)
        return
      }
      defer {
        close(sock)
      }

      var broadcastEnable: Int32 = 1
      if setsockopt(sock, SOL_SOCKET, SO_BROADCAST, &broadcastEnable, socklen_t(MemoryLayout<Int32>.size)) < 0 {
        let errStr = String(cString: strerror(errno))
        reject("SOCKET_OPT_FAILED", "Failed to set SO_BROADCAST: \(errStr)", nil)
        return
      }

      var totalSent = 0
      var successfulDestinations: [String] = []

      for destination in destinations {
        var addr = sockaddr_in()
        addr.sin_family = sa_family_t(AF_INET)
        addr.sin_port = in_port_t(UInt16(port).bigEndian)

        let ptonRes = inet_pton(AF_INET, destination, &addr.sin_addr)
        if ptonRes <= 0 {
          continue
        }

        var destinationSuccess = false
        for rep in 0..<repeatCount {
          let sentBytes = packet.withUnsafeBytes { rawBufferPointer in
            withUnsafePointer(to: &addr) { addrPointer in
              addrPointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { sa in
                sendto(sock, rawBufferPointer.baseAddress, 102, 0, sa, socklen_t(MemoryLayout<sockaddr_in>.size))
              }
            }
          }

          if sentBytes == 102 {
            totalSent += 1
            destinationSuccess = true
          }

          if rep < repeatCount - 1 {
            usleep(useconds_t(delayMs * 1000))
          }
        }

        if destinationSuccess {
          successfulDestinations.append(destination)
        }
      }

      if totalSent == 0 {
        reject("SEND_FAILED", "Failed to transmit Wake-on-LAN packets to destinations: \(destinations)", nil)
        return
      }

      resolve([
        "success": true,
        "packetsSent": totalSent,
        "destinations": successfulDestinations
      ])
    }
  }

  private func parseMacAddress(_ macStr: String) -> [UInt8]? {
    let clean = macStr.components(separatedBy: CharacterSet.alphanumerics.inverted).joined()
    guard clean.count == 12 else { return nil }
    var bytes = [UInt8]()
    for i in stride(from: 0, to: 12, by: 2) {
      let start = clean.index(clean.startIndex, offsetBy: i)
      let end = clean.index(start, offsetBy: 2)
      guard let byte = UInt8(clean[start..<end], radix: 16) else { return nil }
      bytes.append(byte)
    }
    return bytes.count == 6 ? bytes : nil
  }

  private func getLocalSubnetBroadcastAddresses() -> [String] {
    var broadcasts: [String] = []
    var ifaddr: UnsafeMutablePointer<ifaddrs>?
    guard getifaddrs(&ifaddr) == 0, let firstAddr = ifaddr else { return broadcasts }
    defer { freeifaddrs(ifaddr) }

    var ptr = firstAddr
    while true {
      let flags = Int32(ptr.pointee.ifa_flags)
      let isUp = (flags & IFF_UP) != 0
      let isBroadcast = (flags & IFF_BROADCAST) != 0
      let isLoopback = (flags & IFF_LOOPBACK) != 0

      if isUp && isBroadcast && !isLoopback, let addr = ptr.pointee.ifa_addr, addr.pointee.sa_family == UInt8(AF_INET) {
        if let dstAddr = ptr.pointee.ifa_dstaddr, dstAddr.pointee.sa_family == UInt8(AF_INET) {
          var hostname = [CChar](repeating: 0, count: Int(NI_MAXHOST))
          let res = getnameinfo(dstAddr, socklen_t(dstAddr.pointee.sa_len), &hostname, socklen_t(hostname.count), nil, 0, NI_NUMERICHOST)
          if res == 0 {
            let ipStr = String(cString: hostname)
            if !broadcasts.contains(ipStr) {
              broadcasts.append(ipStr)
            }
          }
        }
      }
      guard let next = ptr.pointee.ifa_next else { break }
      ptr = next
    }
    return broadcasts
  }
}
