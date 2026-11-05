package com.smartremote.lg

import java.security.KeyStore
import java.security.MessageDigest
import java.security.cert.CertificateException
import java.security.cert.X509Certificate
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.X509TrustManager

/** Only the bundled LG intermediate is trusted; platform and user CA stores are not consulted. */
internal class LGCertificatePolicy(anchor: X509Certificate) : X509TrustManager {
    private val delegate: X509TrustManager
    init {
        anchor.checkValidity()
        require(anchor.basicConstraints >= 0) { "LG trust anchor is not a CA" }
        val store = KeyStore.getInstance(KeyStore.getDefaultType()).apply {
            load(null)
            setCertificateEntry("lg-ssg", anchor)
        }
        delegate = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm()).run {
            init(store)
            trustManagers.filterIsInstance<X509TrustManager>().single()
        }
    }

    override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {
        if (chain.isEmpty()) throw CertificateException("Empty LG certificate chain")
        chain.forEach { it.checkValidity() }
        val leaf = chain[0]
        if (leaf.basicConstraints >= 0 || !isTVIdentity(leaf)) {
            throw CertificateException("Unexpected LG TV certificate identity")
        }
        val usages = leaf.extendedKeyUsage
        if (usages != null && !usages.contains("1.3.6.1.5.5.7.3.1")) {
            throw CertificateException("Certificate does not permit TLS server authentication")
        }
        delegate.checkServerTrusted(chain, authType)
    }

    override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) {
        throw CertificateException("Client certificates are not supported")
    }
    override fun getAcceptedIssuers(): Array<X509Certificate> = delegate.acceptedIssuers

    companion object {
        const val ANCHOR_SHA256 = "e2bd6464d3f51c1b95b7697d9d6773c33d9412eba0299c568c34937d3fe68aa0"
        fun fingerprint(cert: X509Certificate): String =
            MessageDigest.getInstance("SHA-256").digest(cert.encoded).joinToString("") { "%02x".format(it) }

        fun isTVIdentity(cert: X509Certificate): Boolean =
            Regex("(?:^|,)CN=(?:LGE TV SSG|LG webOS TV)(?:,|$)")
                .containsMatchIn(cert.subjectX500Principal.getName("RFC2253"))

        fun isLocalIPv4(host: String): Boolean {
            val parts = host.split('.')
            if (parts.size != 4 || parts.any { it.isEmpty() || it.length > 3 || it.any { c -> c !in '0'..'9' } }) return false
            val bytes = parts.map { it.toInt() }
            if (bytes.any { it !in 0..255 }) return false
            return bytes[0] == 10 || (bytes[0] == 192 && bytes[1] == 168) ||
                (bytes[0] == 172 && bytes[1] in 16..31)
        }
    }
}
