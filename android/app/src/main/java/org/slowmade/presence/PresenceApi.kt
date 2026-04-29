package org.slowmade.presence

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

object PresenceApi {
    const val BASE_URL = "https://slowmade.duckdns.org"
    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .build()
    private val JSON_TYPE = "application/json".toMediaType()

    suspend fun sendEvent(event: String, ssid: String): Boolean {
        val idToken = AuthManager.getIdToken() ?: return false

        val body = JSONObject().apply {
            put("event", event)
            put("ssid", ssid)
        }.toString().toRequestBody(JSON_TYPE)

        val request = Request.Builder()
            .url("$BASE_URL/api/presence")
            .header("Authorization", AuthManager.buildAuthHeader(idToken))
            .post(body)
            .build()

        return try {
            client.newCall(request).execute().use { it.isSuccessful }
        } catch (e: Exception) {
            false
        }
    }
}
