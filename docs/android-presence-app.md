# Android 재실 감지 앱 — 구현 가이드

새 세션에서 이 문서를 통째로 전달하면 된다.
서버 API는 이미 완성되어 있고, Android 앱만 만들면 된다.

---

## 1. 전체 동작 흐름

```
집 Wi-Fi 연결됨
  → ForegroundService가 감지
  → POST https://slowmade.duckdns.org/api/presence
      { "event": "enter", "ssid": "공유기SSID" }

집 Wi-Fi 해제됨
  → ForegroundService가 감지
  → POST https://slowmade.duckdns.org/api/presence
      { "event": "exit", "ssid": "공유기SSID" }
```

---

## 2. 서버 API 명세

### POST /api/presence

**URL**: `https://slowmade.duckdns.org/api/presence`

**인증**: HTTP 헤더
```
Authorization: Bearer <PRESENCE_API_KEY>
```

**요청 바디** (JSON):
```json
{
  "event": "enter",
  "ssid": "MyHomeWifi"
}
```
- `event`: `"enter"` 또는 `"exit"` (필수)
- `ssid`: Wi-Fi 이름 (선택, 없으면 빈 문자열)

**응답**:
```json
// 성공 201
{ "success": true, "data": { "id": "mongo-object-id" } }

// 인증 실패 401
{ "success": false, "message": "Unauthorized" }

// 잘못된 event 값 400
{ "success": false, "message": "event must be \"enter\" or \"exit\"" }
```

**PRESENCE_API_KEY**: 서버 `.env.local`에 설정된 값.
앱 개발 시 이 값을 앱 안에 하드코딩하거나 BuildConfig로 주입.
(`openssl rand -hex 32` 로 생성)

---

## 3. Android 프로젝트 설정

### 3-1. 프로젝트 생성
- Android Studio → New Project → Empty Activity
- Language: Kotlin
- Min SDK: API 26 (Android 8.0) — NetworkCallback 안정적 지원
- Package name 예시: `org.slowmade.presence`

### 3-2. 의존성 (`app/build.gradle.kts`)
```kotlin
dependencies {
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")
}
```

### 3-3. 권한 (`AndroidManifest.xml`)
```xml
<!-- 기본 네트워크 권한 -->
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />

<!-- SSID 읽기: Android 13+ -->
<uses-permission android:name="android.permission.NEARBY_WIFI_DEVICES"
    android:usesPermissionFlags="neverForLocation" />

<!-- SSID 읽기: Android 12 이하 -->
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />

<!-- 포그라운드 서비스 -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_CONNECTED_DEVICE" />

<!-- 부팅 후 자동 시작 -->
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
```

### 3-4. Manifest에 서비스/리시버 등록
```xml
<application ...>

    <service
        android:name=".PresenceService"
        android:foregroundServiceType="connectedDevice"
        android:exported="false" />

    <receiver
        android:name=".BootReceiver"
        android:exported="true">
        <intent-filter>
            <action android:name="android.intent.action.BOOT_COMPLETED" />
        </intent-filter>
    </receiver>

</application>
```

---

## 4. 핵심 코드

### 4-1. API 키 & 설정 (`Constants.kt`)
```kotlin
object Constants {
    const val SERVER_URL = "https://slowmade.duckdns.org/api/presence"
    const val API_KEY = "여기에_PRESENCE_API_KEY_값_입력"
    const val TARGET_SSID = "여기에_집_와이파이_이름_입력"  // 예: "iptime"
}
```

### 4-2. HTTP 클라이언트 (`PresenceApi.kt`)
```kotlin
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

object PresenceApi {
    private val client = OkHttpClient()
    private val JSON = "application/json".toMediaType()

    fun send(event: String, ssid: String) {
        val body = JSONObject().apply {
            put("event", event)
            put("ssid", ssid)
        }.toString().toRequestBody(JSON)

        val request = Request.Builder()
            .url(Constants.SERVER_URL)
            .header("Authorization", "Bearer ${Constants.API_KEY}")
            .post(body)
            .build()

        try {
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    // 로그 또는 재시도 처리
                }
            }
        } catch (e: Exception) {
            // 네트워크 오류 — 무시 또는 재시도
        }
    }
}
```

### 4-3. ForegroundService (`PresenceService.kt`)
```kotlin
import android.app.*
import android.content.Intent
import android.net.*
import android.os.Build
import android.os.IBinder
import kotlinx.coroutines.*

class PresenceService : Service() {

    private lateinit var connectivityManager: ConnectivityManager
    private lateinit var networkCallback: ConnectivityManager.NetworkCallback
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    override fun onCreate() {
        super.onCreate()
        startForeground(NOTIFICATION_ID, buildNotification())
        connectivityManager = getSystemService(ConnectivityManager::class.java)
        registerNetworkCallback()
    }

    private fun registerNetworkCallback() {
        val request = NetworkRequest.Builder()
            .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
            .build()

        networkCallback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                val ssid = getConnectedSsid()
                if (ssid == Constants.TARGET_SSID) {
                    scope.launch { PresenceApi.send("enter", ssid) }
                }
            }

            override fun onLost(network: Network) {
                // onLost 시점엔 SSID를 이미 읽을 수 없으므로 TARGET_SSID 사용
                scope.launch { PresenceApi.send("exit", Constants.TARGET_SSID) }
            }
        }

        connectivityManager.registerNetworkCallback(request, networkCallback)
    }

    private fun getConnectedSsid(): String {
        val wifiManager = applicationContext.getSystemService(WIFI_SERVICE) as android.net.wifi.WifiManager
        val info = wifiManager.connectionInfo
        // SSID는 따옴표로 감싸져 있음: "\"MyWifi\""
        return info.ssid.removeSurrounding("\"")
    }

    override fun onDestroy() {
        super.onDestroy()
        connectivityManager.unregisterNetworkCallback(networkCallback)
        scope.cancel()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        return START_STICKY  // 시스템이 죽여도 자동 재시작
    }

    private fun buildNotification(): Notification {
        val channelId = "presence_channel"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId, "재실 감지", NotificationManager.IMPORTANCE_LOW
            )
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
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
```

### 4-4. 부팅 후 자동 시작 (`BootReceiver.kt`)
```kotlin
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            val serviceIntent = Intent(context, PresenceService::class.java)
            ContextCompat.startForegroundService(context, serviceIntent)
        }
    }
}
```

### 4-5. MainActivity (`MainActivity.kt`)
```kotlin
import android.content.Intent
import android.os.Bundle
import android.widget.Button
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat

class MainActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        // 앱 실행 시 서비스 자동 시작
        startPresenceService()

        findViewById<Button>(R.id.btnStop).setOnClickListener {
            stopService(Intent(this, PresenceService::class.java))
        }
    }

    private fun startPresenceService() {
        val intent = Intent(this, PresenceService::class.java)
        ContextCompat.startForegroundService(this, intent)
    }
}
```

---

## 5. 주의사항 및 트러블슈팅

### SSID가 `<unknown ssid>` 로 읽히는 경우
- Android 8.1+: `ACCESS_FINE_LOCATION` 권한 런타임 허용 필요
- Android 13+: `NEARBY_WIFI_DEVICES` 권한 런타임 허용 필요
- 권한 없이는 SSID 읽기 불가 — 런타임에 권한 요청 코드 필요

### 권한 런타임 요청 (MainActivity에 추가)
```kotlin
private fun requestPermissions() {
    val permissions = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        arrayOf(android.Manifest.permission.NEARBY_WIFI_DEVICES)
    } else {
        arrayOf(android.Manifest.permission.ACCESS_FINE_LOCATION)
    }
    requestPermissions(permissions, 100)
}
```

### 배터리 최적화로 서비스가 죽는 경우
- 설정 → 앱 → 이 앱 → 배터리 → "제한 없음" 선택
- 또는 앱에서 `ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` 인텐트로 안내

### onAvailable이 TARGET_SSID와 다른 Wi-Fi에도 반응하는 경우
- `getConnectedSsid()` 결과와 `Constants.TARGET_SSID`를 비교하는 로직 필수
- `onLost`는 SSID를 읽을 수 없으므로 무조건 exit 전송 (다른 Wi-Fi 연결 중 해제 시 오탐 가능)
- 오탐 허용 또는 서버에서 중복 exit 무시하도록 처리

---

## 6. 결과 확인

서버에 이벤트가 쌓이면 사이트에서 확인:
- **차트 페이지**: `https://slowmade.duckdns.org/presence`
- **API 직접 조회**: `GET https://slowmade.duckdns.org/api/presence?days=7`

---

## 7. 파일 구조 (완성 후)

```
app/src/main/
├── java/org/slowmade/presence/
│   ├── Constants.kt
│   ├── PresenceApi.kt
│   ├── PresenceService.kt
│   ├── BootReceiver.kt
│   └── MainActivity.kt
├── res/layout/
│   └── activity_main.xml
└── AndroidManifest.xml
```
