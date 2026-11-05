package com.smartremote

import org.junit.Assert.*
import org.junit.Test

class AndroidPermissionPolicyTest {
    private val local = arrayOf("android.permission.ACCESS_LOCAL_NETWORK")
    @Test fun suppressesOnlyTheLegacyDebugMetroRequest() {
        assertTrue(skipLegacyMetroLocalNetworkRequest(true, 36, local))
        assertFalse(skipLegacyMetroLocalNetworkRequest(true, 37, local))
        assertFalse(skipLegacyMetroLocalNetworkRequest(true, 38, local))
        assertFalse(skipLegacyMetroLocalNetworkRequest(false, 36, local))
        assertFalse(skipLegacyMetroLocalNetworkRequest(true, 36, arrayOf("android.permission.CAMERA")))
        assertFalse(skipLegacyMetroLocalNetworkRequest(true, 36, arrayOf(local[0], "android.permission.CAMERA")))
    }
}
