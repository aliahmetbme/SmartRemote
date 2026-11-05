package com.smartremote.wol

import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.SocketException
import org.junit.Assert.*
import org.junit.Test

class WakeDatagramsTest {
    @Test fun sendsStandardPacketAndClosesSocket() {
        val mac = byteArrayOf(2, 17, 34, 51, 68, 85)
        val expected = ByteArray(6) { 0xFF.toByte() } + List(16) { mac }.fold(byteArrayOf()) { acc, bytes -> acc + bytes }
        val packet = requireNotNull(buildWakePacket("02:11:22:33:44:55"))
        assertEquals(102, packet.size)
        DatagramSocket(0, InetAddress.getByName("127.0.0.1")).use { receiver ->
            receiver.soTimeout = 1000
            val sender = DatagramSocket()
            assertEquals(2, sendWakePackets(packet, listOf("127.0.0.1"), receiver.localPort, 2, 0, sender))
            repeat(2) {
                val received = DatagramPacket(ByteArray(102), 102)
                receiver.receive(received)
                assertEquals(102, received.length)
                assertArrayEquals(expected, received.data)
            }
            assertTrue(sender.isClosed)
        }
    }

    @Test fun validatesMacAndSelectsBroadcastDestinations() {
        for (address in listOf("000000000000", "ff:ff:ff:ff:ff:ff", "02/11/22/33/44/55", "short")) {
            assertNull(buildWakePacket(address))
        }
        assertArrayEquals(buildWakePacket("021122334455"), buildWakePacket("0211.2233.4455"))
        assertEquals(listOf("192.168.1.255", "255.255.255.255"),
            wakeDestinations(null) { listOf("192.168.1.255", "192.168.1.255") })
        assertEquals(listOf("255.255.255.255"), wakeDestinations(null) { emptyList() })
        assertEquals(listOf("10.0.0.255"), wakeDestinations("10.0.0.255") { error("Must use explicit destination") })
    }

    @Test fun sendErrorClosesSocketAndPropagates() {
        val sender = object : DatagramSocket() {
            override fun send(packet: DatagramPacket) { throw SocketException("Network unavailable") }
        }
        try {
            sendWakePackets(ByteArray(102), listOf("127.0.0.1"), 9, 1, 0, sender)
            fail("Expected send failure")
        } catch (error: SocketException) {
            assertEquals("Network unavailable", error.message)
        }
        assertTrue(sender.isClosed)
    }
}
