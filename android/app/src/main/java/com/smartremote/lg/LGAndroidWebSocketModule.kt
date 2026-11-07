package com.smartremote.lg

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.smartremote.R
import okhttp3.*
import java.security.SecureRandom
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLContext

/** Transport only: SSAP registration, commands and reconnect policy remain in TypeScript. */
class LGAndroidWebSocketModule(private val context: ReactApplicationContext) :
    ReactContextBaseJavaModule(context) {
    private class Session(val host: String) {
        @Volatile var socket: WebSocket? = null
        @Volatile var fingerprint = ""
        @Volatile var opened = false
    }
    private val sessions = ConcurrentHashMap<Int, Session>()
    // Bind concurrent SSAP/pointer sockets to the same certificate for each target IP.
    private val hostPins = ConcurrentHashMap<String, String>()
    private val policy: LGCertificatePolicy by lazy {
        val anchor = context.resources.openRawResource(R.raw.lg_ssg_intermediate).use {
            CertificateFactory.getInstance("X.509").generateCertificate(it) as X509Certificate
        }
        check(LGCertificatePolicy.fingerprint(anchor) == LGCertificatePolicy.ANCHOR_SHA256) { "LG anchor integrity failure" }
        LGCertificatePolicy(anchor)
    }
    private val baseClient by lazy { OkHttpClient.Builder()
        .connectTimeout(5, TimeUnit.SECONDS).callTimeout(5, TimeUnit.SECONDS).readTimeout(5, TimeUnit.SECONDS)
        .pingInterval(15, TimeUnit.SECONDS).retryOnConnectionFailure(false)
        .followRedirects(false).followSslRedirects(false).build() }

    override fun getName() = "LGAndroidWebSocketModule"

    @ReactMethod
    fun connect(id: Int, url: String) {
        closeSession(id)
        try {
            val parsed = url.toHttpUrlOrNullCompat()
            require(parsed != null && url.startsWith("wss://") && LGCertificatePolicy.isLocalIPv4(parsed.host) &&
                parsed.username.isEmpty() && parsed.password.isEmpty() && parsed.fragment == null) {
                "Android LG connections require WSS to a private IPv4 TV address; insecure fallback is disabled"
            }
            val host = parsed.host
            val session = Session(host)
            sessions[id] = session
            val ssl = SSLContext.getInstance("TLS").apply { init(null, arrayOf(policy), SecureRandom()) }
            val connectivity = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            val wifi = connectivity.allNetworks.firstOrNull {
                connectivity.getNetworkCapabilities(it)?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true
            }
            val clientBuilder = baseClient.newBuilder()
            if (wifi != null) clientBuilder.socketFactory(wifi.socketFactory)
            val client = clientBuilder.sslSocketFactory(ssl.socketFactory, policy)
                .hostnameVerifier { hostname, tls ->
                    // LG's product CN is not an IP SAN. This scoped identity policy is used only
                    // by this socket's private-IP client; chain validation is never bypassed.
                    if (hostname != host) false else try {
                        val chain = tls.peerCertificates.map { it as X509Certificate }.toTypedArray()
                        policy.checkServerTrusted(chain, chain[0].publicKey.algorithm)
                        val fingerprint = LGCertificatePolicy.fingerprint(chain[0])
                        val previous = hostPins.putIfAbsent(host, fingerprint)
                        val accepted = previous == null || previous == fingerprint
                        if (accepted) session.fingerprint = fingerprint
                        accepted
                    } catch (_: Exception) { false }
                }.build()
            session.socket = client.newWebSocket(Request.Builder().url(url).build(), object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) {
                    if (sessions[id] !== session) { webSocket.cancel(); return }
                    session.opened = true
                    emit("onLGWebSocketOpen", id)
                }
                override fun onMessage(webSocket: WebSocket, text: String) {
                    if (sessions[id] === session) emit("onLGWebSocketMessage", id) { putString("data", text) }
                }
                override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                    webSocket.close(code, reason)
                }
                override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                    if (sessions.remove(id, session)) emit("onLGWebSocketClosed", id) {
                        putInt("code", code); putString("reason", reason)
                    }
                }
                override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                    if (sessions.remove(id, session)) {
                        emit("onLGWebSocketError", id) { putString("message", "Secure LG connection failed"); putString("diagnosticCode", connectionFailureCode(t)) }
                        emit("onLGWebSocketClosed", id) { putInt("code", 1006); putString("reason", "Secure LG connection failed"); putString("diagnosticCode", connectionFailureCode(t)) }
                    }
                }
            })
            if (sessions[id] !== session) session.socket?.cancel()
        } catch (e: Exception) {
            closeSession(id)
            emit("onLGWebSocketError", id) { putString("message", e.message ?: "Secure LG transport unavailable") }
            emit("onLGWebSocketClosed", id) { putInt("code", 1006); putString("reason", "Secure LG transport unavailable") }
        }
    }

    // OS state only, no SSID/location access and no extra socket/probe.
    @ReactMethod
    fun getNetworkStatus(promise: Promise) {
        try {
            val manager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            val capabilities = manager.allNetworks.mapNotNull { manager.getNetworkCapabilities(it) }
            val wifi = capabilities.any { it.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) }
            val ethernet = capabilities.any { it.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) }
            promise.resolve(Arguments.createMap().apply {
                putBoolean("wifi", wifi); putBoolean("localTransport", wifi || ethernet)
            })
        } catch (_: Exception) { promise.reject("NETWORK_STATE_UNAVAILABLE", "Network state unavailable") }
    }
    @ReactMethod
    fun getTLSStatus(id: Int, promise: Promise) {
        val session = sessions[id]
        if (session == null || session.fingerprint.isEmpty()) { promise.reject("TLS_UNAVAILABLE", "No verified TLS session"); return }
        promise.resolve(Arguments.createMap().apply {
            putString("domain", session.host); putBoolean("validationSuccess", true)
            putString("leafSummary", "LG TV anchored certificate"); putString("leafFingerprint", session.fingerprint)
            putString("errorDomain", ""); putInt("errorCode", 0); putString("errorDescription", "")
        })
    }

    @ReactMethod
    fun send(id: Int, text: String) {
        val session = sessions[id] ?: return
        if (session.socket?.send(text) != true) {
            if (sessions.remove(id, session)) {
                session.socket?.cancel()
                emit("onLGWebSocketError", id) { putString("message", "LG socket rejected outgoing frame") }
                emit("onLGWebSocketClosed", id) { putInt("code", 1006); putString("reason", "Send failed") }
            }
        }
    }

    @ReactMethod
    fun close(id: Int, code: Int, reason: String) {
        val session = sessions.remove(id) ?: return
        val socket = session.socket ?: return
        if (!session.opened) { socket.cancel(); return }
        try { if (!socket.close(code, reason)) socket.cancel() }
        catch (_: IllegalArgumentException) { socket.cancel() }
    }
    private fun closeSession(id: Int) { sessions.remove(id)?.socket?.cancel() }
    private fun emit(event: String, id: Int, fields: WritableMap.() -> Unit = {}) {
        if (context.hasActiveReactInstance()) {
            val data = Arguments.createMap().apply { putInt("id", id); fields() }
            context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit(event, data)
        }
    }
    override fun invalidate() {
        sessions.keys.toList().forEach { closeSession(it) }
        hostPins.clear()
        baseClient.dispatcher.executorService.shutdown()
        baseClient.connectionPool.evictAll()
        super.invalidate()
    }
    @ReactMethod fun addListener(name: String) {}
    @ReactMethod fun removeListeners(count: Int) {}
}

// OkHttp accepts wss URLs in Request.Builder; parse with its canonical HTTP URL model.
private fun String.toHttpUrlOrNullCompat(): HttpUrl? = try {
    Request.Builder().url(this).build().url
} catch (_: IllegalArgumentException) { null }
