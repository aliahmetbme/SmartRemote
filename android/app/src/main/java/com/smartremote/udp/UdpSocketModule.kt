package com.smartremote.udp

import android.content.Context
import android.net.wifi.WifiManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Network
import android.net.NetworkRequest
import android.os.SystemClock
import android.util.Log
import com.smartremote.BuildConfig
import com.facebook.react.common.LifecycleState
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.Inet4Address
import java.net.HttpURLConnection
import java.net.Proxy
import java.net.URI
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.util.concurrent.RejectedExecutionException
import java.net.InetSocketAddress
import java.util.concurrent.Executors

private class DiscoveryLanUnavailable(message: String) : IOException(message)

class UdpSocketModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), LifecycleEventListener {
    init { reactContext.addLifecycleEventListener(this) }
    override fun onHostResume() {}
    override fun onHostPause() { closeInternal() }
    override fun onHostDestroy() { closeInternal() }

    @Volatile
    private var socket: DatagramSocket? = null
    private var selectedNetwork: Network? = null
    private var unregisterNetworkCallback: (() -> Unit)? = null
    private val descriptions = mutableSetOf<HttpURLConnection>()
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

            if (reactContext.lifecycleState != LifecycleState.RESUMED) {
                throw DiscoveryLanUnavailable("Discovery requires an active app")
            }

            val connectivity = reactContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            val active = connectivity.activeNetwork
            val activeVpn = active?.let {
                connectivity.getNetworkCapabilities(it)?.hasTransport(NetworkCapabilities.TRANSPORT_VPN)
            } == true
            val wifiCandidates = (listOfNotNull(active) + connectivity.allNetworks).distinct().filter {
                val caps = connectivity.getNetworkCapabilities(it)
                caps?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true &&
                    caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_VPN) &&
                    connectivity.getLinkProperties(it)?.linkAddresses?.any { link ->
                        link.address is Inet4Address && !link.address.isLoopbackAddress
                    } == true
            }
            debug("wifiCandidates=${wifiCandidates.size} activeVpn=$activeVpn")
            val network = selectDiscoveryNetwork(active, activeVpn, wifiCandidates)
                ?: throw DiscoveryLanUnavailable(if (activeVpn) {
                    "Automatic discovery is unavailable while a VPN is active"
                } else {
                    "Connect to one Wi-Fi LAN with IPv4 and retry"
                })
            val caps = connectivity.getNetworkCapabilities(network)
            debug("network=wifi active=${network == active} wifiCandidates=${wifiCandidates.size} " +
                "validated=${caps?.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) == true} ipv4=true vpn=false")
            val wifi = reactContext.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
                ?: throw IllegalStateException("Wi-Fi service is unavailable")
            multicastLock = wifi.createMulticastLock("smartremote_udp_lock").also {
                it.setReferenceCounted(false)
            }
            multicastLock?.acquire()

            val s = DatagramSocket(null).also { candidate = it }.apply {
                reuseAddress = true
                broadcast = true
                bind(InetSocketAddress(port))
            }
            network.bindSocket(s)
            socket = s
            selectedNetwork = network
            isListening = true
            val callback = object : ConnectivityManager.NetworkCallback() {
                override fun onLost(lost: Network) {
                    synchronized(this@UdpSocketModule) {
                        if (socket !== s || lost != network) return
                        debug("selected-wifi-lost")
                        emit("onUdpError", Arguments.createMap().apply {
                            putInt("localPort", s.localPort)
                            putString("error", "The Wi-Fi network used for discovery disconnected")
                        })
                        closeInternal()
                    }
                }
            }
            connectivity.registerNetworkCallback(
                NetworkRequest.Builder()
                    .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
                    .addCapability(NetworkCapabilities.NET_CAPABILITY_NOT_VPN)
                    .build(),
                callback,
            )
            unregisterNetworkCallback = { connectivity.unregisterNetworkCallback(callback) }
            if (connectivity.getNetworkCapabilities(network) == null) {
                throw DiscoveryLanUnavailable("The Wi-Fi network used for discovery disconnected")
            }

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
                            putInt("localPort", s.localPort)
                            putString("data", text)
                            putString("address", address)
                            putInt("port", p)
                        }
                        emit("onUdpMessage", map)
                    } catch (e: Exception) {
                        synchronized(this@UdpSocketModule) {
                            if (isListening && socket === s && !s.isClosed) {
                                val errMap = Arguments.createMap().apply {
                                    putInt("localPort", s.localPort)
                                    putString("error", "UDP receive failed")
                                }
                                debug("receive-failed type=${e.javaClass.simpleName}")
                                emit("onUdpError", errMap)
                                closeInternal()
                            }
                        }
                        break
                    }
                }
            }

            debug("bound port=${s.localPort} multicastLock=true")
            promise.resolve(s.localPort)
        } catch (e: Exception) {
            candidate?.close()
            closeInternal()
            debug("bind-failed type=${e.javaClass.simpleName}")
            val code = when (e) {
                is SecurityException -> "PERMISSION_DENIED"
                is IOException -> "BIND_ERROR"
                else -> "UDP_INTERNAL_ERROR"
            }
            promise.reject(code, e.message, e)
        }
    }

    @ReactMethod
    fun send(message: String, port: Int, address: String, promise: Promise) {
        val bound = socket
        submit(promise, "SEND_ERROR") {
            check(bound != null && socket === bound && !bound.isClosed) { "UDP socket is not bound" }
            val bytes = message.toByteArray(Charsets.UTF_8)
            val target = InetAddress.getByName(address)
            bound.send(DatagramPacket(bytes, bytes.size, target, port))
            debug("sent port=${bound.localPort} target=$address:$port")
            promise.resolve(null)
        }
    }

    /** Description requests stay on the scan's LAN and cannot follow redirects. */
    @ReactMethod
    fun fetchDescription(location: String, source: String, timeoutMs: Int, promise: Promise) {
        val bound = socket
        submit(promise, "DESCRIPTION_ERROR") {
            val uri = URI(location)
            require(uri.scheme.equals("http", true) || uri.scheme.equals("https", true))
            val octets = source.split('.').mapNotNull { it.toIntOrNull() }
            require(octets.size == 4 && octets.all { it in 0..255 } &&
                (octets[0] == 10 || octets[0] == 172 && octets[1] in 16..31 ||
                    octets[0] == 192 && octets[1] == 168 || octets[0] == 169 && octets[1] == 254))
            require(uri.host == source && uri.userInfo == null && uri.fragment == null)
            require(uri.port == -1 || uri.port in 1..65535)
            val connection = synchronized(this) {
                val network = selectedNetwork
                check(bound != null && socket === bound && network != null) { "Scan ended" }
                (network.openConnection(uri.toURL(), Proxy.NO_PROXY) as HttpURLConnection).also {
                    descriptions.add(it)
                }
            }
            try {
                val budget = timeoutMs.coerceIn(1, 1500)
                val deadline = SystemClock.elapsedRealtime() + budget
                connection.instanceFollowRedirects = false
                connection.connectTimeout = budget
                connection.readTimeout = budget
                connection.setRequestProperty("Accept", "text/xml, application/xml")
                require(connection.responseCode in 200..299) { "Description HTTP request failed" }
                val body = ByteArrayOutputStream()
                connection.inputStream.use { input ->
                    val chunk = ByteArray(4096)
                    while (true) {
                        check(socket === bound && SystemClock.elapsedRealtime() < deadline) { "Description expired" }
                        val count = input.read(chunk)
                        if (count < 0) break
                        check(body.size() + count <= 65536) { "Description exceeds size limit" }
                        body.write(chunk, 0, count)
                    }
                }
                promise.resolve(body.toString("UTF-8"))
            } finally {
                synchronized(this) { descriptions.remove(connection) }
                connection.disconnect()
            }
        }
    }

    private fun submit(promise: Promise, code: String, task: () -> Unit) {
        try {
            executor.execute {
                try {
                    task()
                } catch (error: Exception) {
                    debug("$code type=${error.javaClass.simpleName}")
                    promise.reject(if (error is SecurityException) "PERMISSION_DENIED" else code, error.message, error)
                }
            }
        } catch (error: RejectedExecutionException) {
            promise.reject(code, "UDP module is inactive", error)
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
        val previousSocket = socket
        val previousLock = multicastLock
        socket = null
        multicastLock = null
        closeDiscoveryResources(previousSocket) {
            if (previousLock?.isHeld == true) previousLock.release()
        }
        if (previousSocket != null || previousLock != null) debug("closed socket and multicast lock")
        selectedNetwork = null
        unregisterNetworkCallback?.let { runCatching(it) }
        unregisterNetworkCallback = null
        descriptions.forEach { runCatching { it.disconnect() } }
        descriptions.clear()

    }

    override fun invalidate() {
        reactContext.removeLifecycleEventListener(this)
        closeInternal()
        executor.shutdownNow()
        super.invalidate()
    }

    private fun debug(message: String) {
        if (BuildConfig.DEBUG) Log.d("SmartRemoteSSDP", message)
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
