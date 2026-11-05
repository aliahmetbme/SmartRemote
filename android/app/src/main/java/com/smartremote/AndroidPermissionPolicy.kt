package com.smartremote

/** Target-36 compatibility for RN's debug-only Metro permission request. */
internal fun skipLegacyMetroLocalNetworkRequest(debug: Boolean, targetSdk: Int, permissions: Array<String>): Boolean =
    debug && targetSdk < 37 && permissions.contentEquals(arrayOf("android.permission.ACCESS_LOCAL_NETWORK"))
