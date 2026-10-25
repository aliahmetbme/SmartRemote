package com.smartremote.wol

import com.facebook.react.bridge.*
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.NetworkInterface
import java.util.concurrent.Executors

class WakeOnLanModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val executor = Executors.newCachedThreadPool()

    override fun getName(): String = "WakeOnLanModule"

    @ReactMethod
    fun isAvailable(promise: Promise) {
        promise.resolve(true)
    }

    @ReactMethod
    fun sendMagicPacket(macAddress: String, options: ReadableMap?, promise: Promise) {
        executor.execute {
            try {
                val clean = macAddress.replace(Regex("[^a-fA-F0-9]"), "")
                if (clean.length != 12) {
                    promise.reject("INVALID_MAC", "Invalid MAC address format: $macAddress")
                    return@execute
                }
                val macBytes = ByteArray(6) { i ->
                    clean.substring(i * 2, i * 2 + 2).toInt(16).toByte()
                }

                val packet = ByteArray(102)
                for (i in 0 until 6) {
                    packet[i] = 0xFF.toByte()
                }
                for (i in 0 until 16) {
                    System.arraycopy(macBytes, 0, packet, 6 + i * 6, 6)
                }

                val port = if (options?.hasKey("port") == true) options.getInt("port") else 9
                val repeatCount = if (options?.hasKey("repeatCount") == true) options.getInt("repeatCount").coerceIn(1, 5) else 3
                val delayMs = if (options?.hasKey("delayMs") == true) options.getInt("delayMs").toLong().coerceIn(10, 500) else 50L

                val destinations = mutableListOf<String>()
                if (options?.hasKey("broadcastAddress") == true) {
                    val custom = options.getString("broadcastAddress")
                    if (!custom.isNullOrEmpty()) {
                        destinations.add(custom)
                    }
                }
                if (destinations.isEmpty()) {
                    destinations.addAll(getSubnetBroadcastAddresses())
                    if (!destinations.contains("255.255.255.255")) {
                        destinations.add("255.255.255.255")
                    }
                }

                val socket = DatagramSocket().apply { broadcast = true }
                var totalSent = 0
                val successfulDestinations = mutableListOf<String>()

                for (dest in destinations) {
                    var successForDest = false
                    val target = InetAddress.getByName(dest)
                    for (i in 0 until repeatCount) {
                        val datagram = DatagramPacket(packet, packet.size, target, port)
                        socket.send(datagram)
                        totalSent++
                        successForDest = true
                        if (i < repeatCount - 1) {
                            Thread.sleep(delayMs)
                        }
                    }
                    if (successForDest) {
                        successfulDestinations.add(dest)
                    }
                }
                socket.close()

                val result = Arguments.createMap().apply {
                    putBoolean("success", true)
                    putInt("packetsSent", totalSent)
                    putArray("destinations", Arguments.createArray().apply {
                        successfulDestinations.forEach { pushString(it) }
                    })
                }
                promise.resolve(result)
            } catch (e: Exception) {
                promise.reject("SEND_FAILED", e.message, e)
            }
        }
    }

    private fun getSubnetBroadcastAddresses(): List<String> {
        val broadcasts = mutableListOf<String>()
        try {
            val interfaces = NetworkInterface.getNetworkInterfaces()
            while (interfaces != null && interfaces.hasMoreElements()) {
                val iface = interfaces.nextElement()
                if (iface.isLoopback || !iface.isUp) continue
                for (addr in iface.interfaceAddresses) {
                    val bcast = addr.broadcast
                    if (bcast != null) {
                        val host = bcast.hostAddress
                        if (host != null && !broadcasts.contains(host)) {
                            broadcasts.add(host)
                        }
                    }
                }
            }
        } catch (_: Exception) {}
        return broadcasts
    }
}
