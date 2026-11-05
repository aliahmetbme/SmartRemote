package com.smartremote.wol

import com.facebook.react.bridge.*
import java.net.NetworkInterface
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException

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
        try {
            executor.execute {
                try {
                    val packet = buildWakePacket(macAddress)
                    if (packet == null) {
                        promise.reject("INVALID_MAC", "Invalid MAC address format")
                        return@execute
                    }

                    val port = if (options?.hasKey("port") == true) options.getInt("port") else 9
                    val repeatCount = if (options?.hasKey("repeatCount") == true) options.getInt("repeatCount").coerceIn(1, 5) else 3
                    val delayMs = if (options?.hasKey("delayMs") == true) options.getInt("delayMs").toLong().coerceIn(10, 500) else 50L
                    val custom = if (options?.hasKey("broadcastAddress") == true) options.getString("broadcastAddress") else null
                    val destinations = wakeDestinations(custom, ::getSubnetBroadcastAddresses)
                    val packetsSent = sendWakePackets(packet, destinations, port, repeatCount, delayMs)

                    val result = Arguments.createMap().apply {
                        putBoolean("success", true)
                        putInt("packetsSent", packetsSent)
                        putArray("destinations", Arguments.createArray().apply {
                            destinations.forEach { pushString(it) }
                        })
                    }
                    promise.resolve(result)
                } catch (e: Exception) {
                    promise.reject("SEND_FAILED", e.message, e)
                }
            }
        } catch (e: RejectedExecutionException) {
            promise.reject("SEND_FAILED", "Wake-on-LAN module is no longer active", e)
        }
    }

    override fun invalidate() {
        executor.shutdownNow()
        super.invalidate()
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
