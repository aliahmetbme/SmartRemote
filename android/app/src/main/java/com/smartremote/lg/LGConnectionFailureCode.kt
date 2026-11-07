package com.smartremote.lg

/** Typed causes only: ConnectException's message is not reliable proof of ECONNREFUSED. */
internal fun connectionFailureCode(error: Throwable): String {
    var current: Throwable? = error
    repeat(6) {
        when (current) {
            is java.security.cert.CertificateException, is javax.net.ssl.SSLPeerUnverifiedException -> return "TLS_TRUST_FAILURE"
            is java.net.SocketTimeoutException -> return "CONNECTION_TIMEOUT"
            is java.net.NoRouteToHostException -> return "TV_UNREACHABLE"
            is java.net.UnknownHostException -> return "DNS_FAILURE"
            is android.system.ErrnoException -> if ((current as android.system.ErrnoException).errno == android.system.OsConstants.ECONNREFUSED) return "CONNECTION_REFUSED"
        }
        current = current?.cause
    }
    return "UNKNOWN"
}
