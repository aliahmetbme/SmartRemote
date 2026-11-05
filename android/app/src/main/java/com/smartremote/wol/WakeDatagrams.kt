package com.smartremote.wol

import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress

internal fun buildWakePacket(address: String): ByteArray? {
    val clean = address.trim().replace(Regex("[:.\\-]"), "")
    if (!clean.matches(Regex("[0-9a-fA-F]{12}")) ||
        clean == "000000000000" || clean.equals("FFFFFFFFFFFF", ignoreCase = true)
    ) return null

    val mac = ByteArray(6) { i -> clean.substring(i * 2, i * 2 + 2).toInt(16).toByte() }
    return ByteArray(102).apply {
        fill(0xFF.toByte(), 0, 6)
        for (i in 0 until 16) System.arraycopy(mac, 0, this, 6 + i * 6, 6)
    }
}

internal fun wakeDestinations(custom: String?, subnetBroadcasts: () -> List<String>): List<String> =
    if (custom.isNullOrEmpty()) (subnetBroadcasts() + "255.255.255.255").distinct()
    else listOf(custom)

internal fun sendWakePackets(
    packet: ByteArray,
    destinations: List<String>,
    port: Int,
    repeatCount: Int,
    delayMs: Long,
    socket: DatagramSocket = DatagramSocket(),
): Int = socket.use {
    it.broadcast = true
    var sent = 0
    for (destination in destinations) {
        val target = InetAddress.getByName(destination)
        repeat(repeatCount) { index ->
            it.send(DatagramPacket(packet, packet.size, target, port))
            sent++
            if (index < repeatCount - 1) Thread.sleep(delayMs)
        }
    }
    sent
}
