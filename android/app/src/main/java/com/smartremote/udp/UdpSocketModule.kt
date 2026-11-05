package com.smartremote.udp

import android.content.Context
import android.net.wifi.WifiManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.InetSocketAddress
import java.util.concurrent.Executors

class UdpSocketModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), LifecycleEventListener {
    init { reactContext.addLifecycleEventListener(this) }
    override fun onHostResume() {}
    override fun onHostPause() { closeInternal() }
    override fun onHostDestroy() { closeInternal() }

    @Volatile
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
    @Synchronized
    fun bind(port: Int, promise: Promise) {
        var candidate: DatagramSocket? = null
        try {
            closeInternal()

            val connectivity = reactContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            val network = connectivity.allNetworks.firstOrNull {
                connectivity.getNetworkCapabilities(it)?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true
            } ?: throw IllegalStateException("Connect this phone to the same Wi-Fi network as the TV, then scan again or use its IP address")
            val wifi = reactContext.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
            multicastLock = wifi?.createMulticastLock("smartremote_udp_lock")?.apply {
                setReferenceCounted(true)
                acquire()
            }

            val s = DatagramSocket(null).also { candidate = it }.apply {
                reuseAddress = true
                broadcast = true
                bind(InetSocketAddress(port))
            }
            network.bindSocket(s)
            socket = s
            isListening = true

            executor.execute {
                val buffer = ByteArray(4096)
                while (isListening && socket === s && !s.isClosed) {
                    try {
                        val packet = DatagramPacket(buffer, buffer.size)
                        s.receive(packet)
                        if (socket !== s || !isListening) break
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
                        synchronized(this@UdpSocketModule) {
                            if (isListening && socket === s && !s.isClosed) {
                                val errMap = Arguments.createMap().apply {
                                    putString("error", e.message ?: "Socket read error")
                                }
                                emit("onUdpError", errMap)
                                closeInternal()
                            }
                        }
                        break
                    }
                }
            }

            promise.resolve(s.localPort)
        } catch (e: Exception) {
            candidate?.close()
            closeInternal()
            promise.reject("BIND_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun send(message: String, port: Int, address: String, promise: Promise) {
        executor.execute {
            try {
                val s = socket ?: throw IllegalStateException("UDP socket is not bound")
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

    @Synchronized
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

    override fun invalidate() {
        reactContext.removeLifecycleEventListener(this)
        closeInternal()
        executor.shutdownNow()
        super.invalidate()
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
