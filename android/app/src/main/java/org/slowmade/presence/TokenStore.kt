package org.slowmade.presence

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

object TokenStore {
    private const val FILE_NAME = "presence_secure_prefs"
    private const val KEY_TOKEN = "presence_token"
    private const val KEY_SSID = "target_ssid"
    private const val KEY_LAST_EVENT = "last_event"
    private const val KEY_LAST_EVENT_TIME = "last_event_time"

    private fun prefs(context: Context) = EncryptedSharedPreferences.create(
        context,
        FILE_NAME,
        MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    fun saveToken(context: Context, token: String) =
        prefs(context).edit().putString(KEY_TOKEN, token).apply()

    fun getToken(context: Context): String? =
        prefs(context).getString(KEY_TOKEN, null)

    fun saveSsid(context: Context, ssid: String) =
        prefs(context).edit().putString(KEY_SSID, ssid).apply()

    fun getSsid(context: Context): String? =
        prefs(context).getString(KEY_SSID, null)

    fun saveLastEvent(context: Context, event: String) {
        prefs(context).edit()
            .putString(KEY_LAST_EVENT, event)
            .putString(KEY_LAST_EVENT_TIME, System.currentTimeMillis().toString())
            .apply()
    }

    fun getLastEvent(context: Context): String? =
        prefs(context).getString(KEY_LAST_EVENT, null)

    fun getLastEventTime(context: Context): Long? =
        prefs(context).getString(KEY_LAST_EVENT_TIME, null)?.toLongOrNull()

    fun clear(context: Context) =
        prefs(context).edit().clear().apply()
}
