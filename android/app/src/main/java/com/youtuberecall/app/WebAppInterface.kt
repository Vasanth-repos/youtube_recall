package com.youtuberecall.app

import android.content.Context
import android.content.SharedPreferences
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.webkit.JavascriptInterface
import android.widget.Toast

/**
 * JavaScript Bridge Interface exposed to Web UI as window.AndroidBridge
 */
class WebAppInterface(
    private val activity: MainActivity,
    private val prefs: SharedPreferences
) {

    @JavascriptInterface
    fun showToast(message: String) {
        activity.runOnUiThread {
            Toast.makeText(activity, message, Toast.LENGTH_SHORT).show()
        }
    }

    @JavascriptInterface
    fun getServerUrl(): String {
        return prefs.getString("server_url", "") ?: ""
    }

    @JavascriptInterface
    fun setServerUrl(url: String) {
        var cleanUrl = url.trim()
        if (!cleanUrl.startsWith("http://") && !cleanUrl.startsWith("https://")) {
            cleanUrl = "http://$cleanUrl"
        }
        if (cleanUrl.endsWith("/")) {
            cleanUrl = cleanUrl.substring(0, cleanUrl.length - 1)
        }
        prefs.edit().putString("server_url", cleanUrl).apply()
    }

    @JavascriptInterface
    fun openServerDialog() {
        activity.runOnUiThread {
            activity.showServerUrlDialog()
        }
    }

    @JavascriptInterface
    fun vibrate(milliseconds: Long) {
        try {
            val vibrator = activity.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator?.vibrate(VibrationEffect.createOneShot(milliseconds, VibrationEffect.DEFAULT_AMPLITUDE))
            } else {
                @Suppress("DEPRECATION")
                vibrator?.vibrate(milliseconds)
            }
        } catch (e: Exception) {}
    }

    @JavascriptInterface
    fun getAppVersion(): String {
        return "1.1.0"
    }

    @JavascriptInterface
    fun isAndroidNative(): Boolean {
        return true
    }
}
