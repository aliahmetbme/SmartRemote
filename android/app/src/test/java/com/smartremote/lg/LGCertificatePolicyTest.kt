package com.smartremote.lg

import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.security.cert.CertificateException
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate

/** Synthetic certificates exercise cryptographic validation. They are not LG hardware evidence. */
class LGCertificatePolicyTest {
    private fun cert(name: String): X509Certificate = javaClass.getResourceAsStream("/tls/$name.pem").use {
        CertificateFactory.getInstance("X.509").generateCertificate(it) as X509Certificate
    }
    private val anchor get() = cert("ca")

    @Test fun acceptsValidServerChainWithExactTVIdentity() {
        LGCertificatePolicy(anchor).checkServerTrusted(arrayOf(cert("tv"), anchor), "RSA")
    }
    @Test fun rejectsWrongIdentityEvenWhenSignedByTrustedAnchor() {
        assertThrows(CertificateException::class.java) {
            LGCertificatePolicy(anchor).checkServerTrusted(arrayOf(cert("wrong-identity"), anchor), "RSA")
        }
    }
    @Test fun rejectsExpiredLeaf() {
        assertThrows(CertificateException::class.java) {
            LGCertificatePolicy(anchor).checkServerTrusted(arrayOf(cert("expired"), anchor), "RSA")
        }
    }
    @Test fun rejectsClientOnlyCertificate() {
        assertThrows(CertificateException::class.java) {
            LGCertificatePolicy(anchor).checkServerTrusted(arrayOf(cert("client-only"), anchor), "RSA")
        }
    }
    @Test fun productionAnchorHasExpectedIntegrityValidityAndRejectsSyntheticChain() {
        val production = File("src/main/res/raw/lg_ssg_intermediate.der").inputStream().use {
            CertificateFactory.getInstance("X.509").generateCertificate(it) as X509Certificate
        }
        assertEquals(LGCertificatePolicy.ANCHOR_SHA256, LGCertificatePolicy.fingerprint(production))
        production.checkValidity()
        assertThrows(CertificateException::class.java) {
            LGCertificatePolicy(production).checkServerTrusted(arrayOf(cert("tv"), anchor), "RSA")
        }
    }
    @Test fun rejectsEmptyChainAndClientAuthentication() {
        val policy = LGCertificatePolicy(anchor)
        assertThrows(CertificateException::class.java) { policy.checkServerTrusted(emptyArray(), "RSA") }
        assertThrows(CertificateException::class.java) { policy.checkClientTrusted(arrayOf(cert("tv")), "RSA") }
    }
    @Test fun restrictsTargetsToPrivateIPv4WithoutDNSOrLoopback() {
        listOf("10.0.0.1", "172.16.0.1", "172.31.255.254", "192.168.1.10").forEach {
            assertTrue(LGCertificatePolicy.isLocalIPv4(it))
        }
        listOf("8.8.8.8", "127.0.0.1", "172.32.0.1", "192.168.1.256", "localhost", "::1").forEach {
            assertFalse(LGCertificatePolicy.isLocalIPv4(it))
        }
    }
}
