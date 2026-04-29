package org.slowmade.presence

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

object PresenceApi {
    private const val BASE_URL = "https://slowmade.duckdns.org"
    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .build()
    private val JSON_TYPE = "application/json".toMediaType()

    fun sendEvent(token: String, event: String, ssid: String): Boolean {
        val body = JSONObject().apply {
            put("event", event)
            put("ssid", ssid)
        }.toString().toRequestBody(JSON_TYPE)

        val request = Request.Builder()
            .url("$BASE_URL/api/presence")
            .header("Authorization", "Bearer $token")
            .post(body)
            .build()

        return try {
            client.newCall(request).execute().use { it.isSuccessful }
        } catch (e: Exception) {
            false
        }
    }
}
