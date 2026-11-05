package com.smartremote

import android.os.Bundle
import android.os.Build
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import androidx.core.view.WindowInsetsControllerCompat
import com.facebook.react.ReactActivity
import com.facebook.react.modules.core.PermissionListener
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.swmansion.rnscreens.fragment.restoration.RNScreensFragmentFactory

class MainActivity : ReactActivity() {

  override fun onCreate(savedInstanceState: Bundle?) {
    // Let React Navigation rebuild its screens after a configuration change.
    supportFragmentManager.fragmentFactory = RNScreensFragmentFactory()
    super.onCreate(savedInstanceState)
    window.setBackgroundDrawable(ColorDrawable(Color.rgb(11, 13, 17)))
    applyDarkSystemBars()
  }

  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    if (hasFocus) applyDarkSystemBars()
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    applyDarkSystemBars()
  }

  @Suppress("DEPRECATION")
  private fun applyDarkSystemBars() {
    // Keep RN's edge-to-edge layout. The app paints dark content beneath transparent
    // bars, so light icons are required even when the device uses its light theme.
    WindowInsetsControllerCompat(window, window.decorView).apply {
      isAppearanceLightStatusBars = false
      isAppearanceLightNavigationBars = false
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      window.isNavigationBarContrastEnforced = false
    } else {
      window.navigationBarColor = Color.rgb(21, 24, 30)
    }
  }


  // RN's debug Metro helper checks device API but not targetSdk. Do not forward its
  // Android-17-only request for our target-36 app. Report the actual permission state
  // to its continuation; never fabricate a grant or intercept other permissions.
  override fun requestPermissions(permissions: Array<String>, requestCode: Int, listener: PermissionListener?) {
    if (skipLegacyMetroLocalNetworkRequest(BuildConfig.DEBUG, applicationInfo.targetSdkVersion, permissions)) {
      listener?.onRequestPermissionsResult(requestCode, permissions,
          IntArray(permissions.size) { checkSelfPermission(permissions[it]) })
      return
    }
    super.requestPermissions(permissions, requestCode, listener)
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "SmartRemote"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
