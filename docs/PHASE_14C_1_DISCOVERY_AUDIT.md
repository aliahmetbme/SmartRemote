# Phase 14C.1 — Discovery audit

Manual IP works on Android and iOS according to the operator. The audit confirmed two Android discovery defects: the first enumerated Wi-Fi network won regardless of the active LAN, and a valid SSDP response could disappear if optional XML was still pending at the scan deadline. The exact cause of the reported Samsung failures remains unverified. iOS cannot currently run SSDP because its native module is a stub and there is no verified signed multicast authorization.

## Architecture and findings

Discovery screen → DiscoveryManager → DiscoverTVsUseCase → ITVDiscoveryService → TVDiscoveryService → LG SSDP strategy and parsers → IUdpSocketTransport → native UDP bridge. DiscoveryManager owns scan lifecycle and passes events to the existing Redux composition. Optional description fetching is injected at composition, without expanding the UDP interface. Manual IP is a separate direct probe.

| Finding | Evidence and change |
| --- | --- |
| A. iOS explicitly disables SSDP | JS reports unavailable and rejects bind. Xcode includes a Swift/Objective-C bridge, but the Swift stub returns false and rejects bind/send. The screen now hides Scan when capability is absent and keeps manual IP visible. |
| B. Android network selection | Replaced enumeration order with active non-VPN Wi-Fi with IPv4, or a single eligible Wi-Fi when the default route is elsewhere. Active VPN and ambiguous candidates report a network error. Internet validation is diagnostic only. |
| C. Asynchronous XML | Valid SSDP recognition is recorded synchronously. Enriched metadata is emitted if ready, otherwise the scan publishes the fallback at its deadline. Cancellation and late XML cannot publish stale results. DiscoveryManager no longer emits a second copy at completion. |
| D. Wrong platform message | Removed the Apple-specific message from the generic discovery service. The UI differentiates unsupported, permission, network, native startup failure and empty completion. |
| E. LG filter | The query target stays `urn:lge-com:service:webos-second-screen:1`. Recognition matches it case-insensitively. LG's Connect SDK uses the same filter. The actual 65QNED70A6A response remains unverified. [Connect SDK source](https://github.com/ConnectSDK/Connect-SDK-Android-Core/blob/master/src/com/connectsdk/service/WebOSTVService.java) |

Android binds an unconnected IPv4 datagram socket to the selected Network and sends one CRLF-terminated M-SEARCH from its ephemeral port to `239.255.255.250:1900`. A network callback ends the scan if its Wi-Fi disappears. Cleanup closes the socket, releases the multicast lock, unregisters the network callback and disconnects pending descriptions. Native invalidation also shuts down the executor. [Android socket binding](https://developer.android.com/reference/android/net/Network#bindSocket(java.net.DatagramSocket))

Recognition uses the private or link-local IPv4 UDP sender and rejects public or loopback senders. Identity uses the USN UUID or sender IP. Optional HTTP(S) XML must point at the sender and cannot follow redirects. Android uses the selected network, a 64 KiB limit, at most four fetches per scan and a nominal 1.5 s per-request budget. XML, cleartext policy and certificate failures fall back to the basic device record. LG WebSocket, TLS, manual IP, pairing, WOL, Motion and remote commands were outside the change.

## Diagnostics and observations

Debug-only summaries report selected Wi-Fi, VPN/validation flags, bound port, destination, sent, received, parsed, recognized and emitted counts, rejection and identity categories, XML stages, cancellation, duration and cleanup. Native status lines use the `SmartRemoteSSDP` tag. No credentials, full payloads or remote addresses are logged by this instrumentation.

One Mac LAN probe sent the same M-SEARCH with multicast TTL 1 and listened for four seconds. It recorded **1 send, 0 datagrams, 0 parsed replies and 0 recognized responders**. This cannot distinguish TV availability, LAN forwarding or routing. No model-specific ST or Bonjour advertisement was verified. The iOS Info.plist declarations for `_webos._tcp` and `_airplay._tcp` are not evidence of a usable TV service. No mDNS strategy was added.

## iOS authorization

Info.plist already declares Local Network usage. The project uses automatic signing, but has no `CODE_SIGN_ENTITLEMENTS` setting, multicast entitlement file or embedded device profile in the available build. Apple requires authorization for the restricted `com.apple.developer.networking.multicast` entitlement. The outgoing SSDP multicast query needs it even when the reply is unicast. Local Network privacy approval is separate. [Apple entitlement requirements](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.networking.multicast?changes=latest_minor) · [Apple TN3179](https://developer.apple.com/documentation/Technotes/tn3179-understanding-local-network-privacy?changes=_2%2C_2)

The developer team must request Multicast Networking permission from Apple for the app ID, configure the approved capability and refresh provisioning. Verify the entitlement in the device binary signature and provisioning profile, then implement the Swift socket transport and test on a physical iPhone. A simulator build or plist key cannot verify authorization.

## Changed paths

- Android: `android/app/src/main/java/com/smartremote/udp/UdpSocketModule.kt`, `android/app/src/main/java/com/smartremote/udp/DiscoveryNetworkPolicy.kt`.
- Discovery: `src/infrastructure/discovery/discovery-strategies/LGWebOSSSDPDiscoveryStrategy.ts`, `src/infrastructure/discovery/ssdp/SSDPParser.ts`, `src/infrastructure/discovery/transport/NativeUdpSocketTransport.ts`, `src/infrastructure/discovery/TVDiscoveryService.ts`.
- Composition and UI: `src/application/services/DiscoveryManager.ts`, `src/domain/errors/TVDiscoveryError.ts`, `src/domain/interfaces/ITVDiscoveryService.ts`, `src/di/container.ts`, `src/presentation/screens/TVDiscoveryScreen.tsx`.
- Tests: `android/app/src/test/java/com/smartremote/udp/DiscoveryNetworkPolicyTest.kt`, `src/__tests__/unit/discovery/LGWebOSSSDPDiscoveryStrategy.test.ts`, `src/__tests__/unit/discovery/AndroidUdpTransport.test.ts`, `src/__tests__/integration/Phase7ArchitectureRefactoring.test.ts`, `src/__tests__/presentation/TVDiscoveryScreen.test.tsx`.

## Verification and physical procedure

TypeScript passed. ESLint had zero errors and six warnings from generated reports. Jest passed **55 suites and 522 tests** in 5.437 seconds, with the existing open-handle warning after assertions. Android debug build and **18 JVM tests** passed. iOS Simulator Debug build succeeded. Coverage includes M-SEARCH, parser cases, duplicate TVs, unsafe LOCATION, pending XML at timeout/cancel, bind/send/receive failure, rapid replacement scans, network policy, cleanup, unsupported iOS capability and manual IP. JVM cleanup uses a multicast lease stand-in.

ADB listed only the emulator. Xcode tooling showed the physical iPhone as Connecting. No physical phone scan, pairing or LG model advertisement was verified.

1. **Samsung:** Put the S24 Ultra and awake LG on the same LAN. Run a debug scan and capture `adb logcat -s SmartRemoteSSDP ReactNativeJS`. Record bind/port, send, receive, parse, LG recognition and emission separately. Connect from the discovered row and verify TV identity. Repeat after app restart and Wi-Fi reconnection. Test cancellation and Wi-Fi loss during scan. Zero packets after a successful send calls for a LAN/TV check; received packets with no recognition call for an ST and source check.
2. **iPhone:** Verify signing and enable a real native transport first. Check Local Network privacy approval, run a scan on the same LAN as the LG, capture query and response counts, verify identity and pairing, and repeat after restart. Use manual IP until these prerequisites are met.
3. Consider Bonjour only if a physical capture identifies a service suitable for the exact TV and its remote protocol.
