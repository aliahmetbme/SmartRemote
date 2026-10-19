package com.smartremote.udp

import android.content.Context
import android.net.wifi.WifiManager
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.InetSocketAddress
import java.util.concurrent.Executors

class UdpSocketModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private var socket: DatagramSocket? = null
    private var multicastLock: WifiManager.MulticastLock? = null
    @Volatile
    private var isListening = false
    private val executor = Executors.newCachedThreadPool()

    override fun getName(): String = "UdpSocketModule"

    @ReactMethod
    fun isAvailable(promise: Promise) {
        promise.resolve(true)
    }

    @ReactMethod
    fun bind(port: Int, promise: Promise) {
        try {
            closeInternal()

            val wifi = reactContext.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
            multicastLock = wifi?.createMulticastLock("smartremote_udp_lock")?.apply {
                setReferenceCounted(true)
                acquire()
            }

            val s = DatagramSocket(null).apply {
                reuseAddress = true
                broadcast = true
                bind(InetSocketAddress(port))
            }
            socket = s
            isListening = true

            executor.execute {
                val buffer = ByteArray(4096)
                while (isListening && !s.isClosed) {
                    try {
                        val packet = DatagramPacket(buffer, buffer.size)
                        s.receive(packet)
                        val text = String(packet.data, 0, packet.length, Charsets.UTF_8)
                        val address = packet.address?.hostAddress ?: ""
                        val p = packet.port

                        val map = Arguments.createMap().apply {
                            putString("data", text)
                            putString("address", address)
                            putInt("port", p)
                        }
                        emit("onUdpMessage", map)
                    } catch (e: Exception) {
                        if (isListening && !s.isClosed) {
                            val errMap = Arguments.createMap().apply {
                                putString("error", e.message ?: "Socket read error")
                            }
                            emit("onUdpError", errMap)
                        }
                    }
                }
            }

            promise.resolve(s.localPort)
        } catch (e: Exception) {
            promise.reject("BIND_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun send(message: String, port: Int, address: String, promise: Promise) {
        executor.execute {
            try {
                val s = socket ?: DatagramSocket().also { socket = it }
                s.broadcast = true
                val bytes = message.toByteArray(Charsets.UTF_8)
                val target = InetAddress.getByName(address)
                val packet = DatagramPacket(bytes, bytes.size, target, port)
                s.send(packet)
                promise.resolve(null)
            } catch (e: Exception) {
                promise.reject("SEND_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun close(promise: Promise) {
        try {
            closeInternal()
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("CLOSE_ERROR", e.message, e)
        }
    }

    private fun closeInternal() {
        isListening = false
        try {
            socket?.close()
        } catch (_: Exception) {}
        socket = null

        try {
            if (multicastLock?.isHeld == true) {
                multicastLock?.release()
            }
        } catch (_: Exception) {}
        multicastLock = null
    }

    private fun emit(eventName: String, params: WritableMap) {
        if (reactContext.hasActiveReactInstance()) {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, params)
        }
    }

    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}
}
