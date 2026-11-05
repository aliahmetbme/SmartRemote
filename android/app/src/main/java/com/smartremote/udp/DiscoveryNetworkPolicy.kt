package com.smartremote.udp

import java.net.DatagramSocket

/** Prefer the active eligible LAN. An ambiguous fallback or active VPN requires user choice. */
internal fun <T> selectDiscoveryNetwork(active: T?, activeVpn: Boolean, eligibleWifi: List<T>): T? {
    if (activeVpn) return null
    return eligibleWifi.firstOrNull { it == active } ?: eligibleWifi.singleOrNull()
}


internal fun closeDiscoveryResources(socket: DatagramSocket?, releaseMulticastLock: () -> Unit) {
    try {
        socket?.close()
    } catch (_: Exception) {
        // Best-effort cleanup still releases the multicast lock.
    } finally {
        runCatching(releaseMulticastLock)
    }
}
