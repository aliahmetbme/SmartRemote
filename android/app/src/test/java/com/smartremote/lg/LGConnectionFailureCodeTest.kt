package com.smartremote.lg

import org.junit.Assert.assertEquals
import org.junit.Test
import java.net.*
import javax.net.ssl.SSLHandshakeException
import java.security.cert.CertificateException

class LGConnectionFailureCodeTest {
    @Test fun timeoutIsStructured() { assertEquals("CONNECTION_TIMEOUT", connectionFailureCode(SocketTimeoutException())) }
    @Test fun noRouteIsUnreachable() { assertEquals("TV_UNREACHABLE", connectionFailureCode(NoRouteToHostException())) }
    @Test fun dnsIsStructured() { assertEquals("DNS_FAILURE", connectionFailureCode(UnknownHostException())) }
    @Test fun certificateCauseIsPreserved() {
        val error = SSLHandshakeException("redacted").apply { initCause(CertificateException()) }
        assertEquals("TLS_TRUST_FAILURE", connectionFailureCode(error))
    }
    @Test fun genericTextCannotProveRefusalOrTlsTrustFailure() {
        assertEquals("UNKNOWN", connectionFailureCode(ConnectException("ECONNREFUSED")))
        assertEquals("UNKNOWN", connectionFailureCode(SSLHandshakeException("certificate")))
    }
}
