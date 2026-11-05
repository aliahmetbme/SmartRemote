package com.smartremote.udp

import java.net.DatagramSocket
import org.junit.Assert.*
import org.junit.Test

class DiscoveryNetworkPolicyTest {
    @Test fun activeWifiWinsRegardlessOfEnumerationOrder() {
        assertEquals("active", selectDiscoveryNetwork("active", false, listOf("other", "active")))
    }

    @Test fun cellularFallbackRequiresExactlyOneEligibleLan() {
        assertEquals("wifi", selectDiscoveryNetwork("cellular", false, listOf("wifi")))
        assertNull(selectDiscoveryNetwork("cellular", false, listOf("first", "second")))
        assertNull(selectDiscoveryNetwork("cellular", false, emptyList()))
    }

    @Test fun closesTheSocketAndReleasesTheMulticastLease() {
        val socket = DatagramSocket()
        var releases = 0
        closeDiscoveryResources(socket) { releases++ }
        assertTrue(socket.isClosed)
        closeDiscoveryResources(null) { releases++ } // Lock was acquired but bind failed.
        assertEquals(2, releases)
    }

    @Test fun vpnIsNotBypassed() {
        assertNull(selectDiscoveryNetwork("vpn", true, listOf("wifi")))
    }
}
