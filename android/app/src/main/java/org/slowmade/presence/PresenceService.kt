package org.slowmade.presence

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.wifi.WifiInfo
import android.os.Build
import android.os.IBinder
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class PresenceService : Service() {

    private lateinit var connectivityManager: ConnectivityManager
    private lateinit var networkCallback: ConnectivityManager.NetworkCallback
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    // @Volatile — NetworkCallback 스레드와 코루틴이 동시 접근하므로 필수
    @Volatile private var lastEventType = ""
    @Volatile private var lastEventTime = 0L
    private val DEBOUNCE_MS = 3_000L

    override fun onCreate() {
        super.onCreate()
        startForeground(NOTIFICATION_ID, buildNotification())
        connectivityManager = getSystemService(ConnectivityManager::class.java)
        registerCallback()
    }

    private fun registerCallback() {
        val request = NetworkRequest.Builder()
            .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()

        networkCallback = object : ConnectivityManager.NetworkCallback() {

            // onCapabilitiesChanged: SSID가 안정적으로 읽히는 시점 (onAvailable보다 안전)
            override fun onCapabilitiesChanged(
                network: Network,
                capabilities: NetworkCapabilities
            ) {
                val ssid = getSsidFromCapabilities(capabilities) ?: return
                val targetSsid = TokenStore.getSsid(applicationContext) ?: return
                if (ssid == targetSsid) sendEvent("enter", ssid)
            }

            override fun onLost(network: Network) {
                val targetSsid = TokenStore.getSsid(applicationContext) ?: return
                sendEvent("exit", targetSsid)
            }
        }

        connectivityManager.registerNetworkCallback(request, networkCallback)
    }

    private fun getSsidFromCapabilities(capabilities: NetworkCapabilities): String? {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val wifiInfo = capabilities.transportInfo as? WifiInfo ?: return null
            wifiInfo.ssid.removeSurrounding("\"").takeIf { it != "<unknown ssid>" }
        } else {
            @Suppress("DEPRECATION")
            val wm = applicationContext.getSystemService(Context.WIFI_SERVICE)
                    as android.net.wifi.WifiManager
            @Suppress("DEPRECATION")
            wm.connectionInfo.ssid.removeSurrounding("\"").takeIf { it != "<unknown ssid>" }
        }
    }

    private fun sendEvent(event: String, ssid: String) {
        val now = System.currentTimeMillis()
        if (event == lastEventType && now - lastEventTime < DEBOUNCE_MS) return
        lastEventType = event
        lastEventTime = now

        val token = TokenStore.getToken(applicationContext) ?: return
        TokenStore.saveLastEvent(applicationContext, event)

        scope.launch {
            repeat(3) { attempt ->
                if (PresenceApi.sendEvent(token, event, ssid)) return@launch
                delay(5_000L * (attempt + 1))
            }
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_STICKY

    override fun onDestroy() {
        super.onDestroy()
        connectivityManager.unregisterNetworkCallback(networkCallback)
        scope.cancel()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun buildNotification(): Notification {
        val channelId = "presence_channel"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel(channelId, "재실 감지", NotificationManager.IMPORTANCE_LOW)
                .also { getSystemService(NotificationManager::class.java).createNotificationChannel(it) }
        }
        return Notification.Builder(this, channelId)
            .setContentTitle("재실 감지 실행 중")
            .setSmallIcon(android.R.drawable.ic_menu_compass)
            .build()
    }

    companion object {
        const val NOTIFICATION_ID = 1001
    }
}
