# Android 재실 감지 앱 — 구현 가이드

새 세션에서 이 문서를 통째로 전달하면 된다.
서버 API는 이미 완성되어 있고, Android 앱만 만들면 된다.

---

## 1. 전체 동작 흐름

```
[사용자 흐름]
앱 설치 → 랜딩 화면 → 사이트에서 토큰 복사 → 앱에 붙여넣기 → 메인 화면

[백그라운드 동작]
집 Wi-Fi 연결됨 → ForegroundService 감지
  → POST /api/presence { "event": "enter", "ssid": "iptime" }

집 Wi-Fi 해제됨 → ForegroundService 감지
  → POST /api/presence { "event": "exit", "ssid": "iptime" }
```

---

## 2. 서버 API 명세

### 베이스 URL
```
https://slowmade.duckdns.org
```

### POST /api/presence — 이벤트 전송

**인증**: HTTP 헤더
```
Authorization: Bearer <사용자_개인_토큰>
Content-Type: application/json
```

**요청 바디**:
```json
{ "event": "enter", "ssid": "iptime" }
```
- `event`: `"enter"` 또는 `"exit"` (필수)
- `ssid`: Wi-Fi 이름 (선택)

**응답**:
```json
// 성공 201
{ "success": true, "data": { "id": "mongo-object-id" } }

// 인증 실패 401
{ "success": false, "message": "Unauthorized" }

// 잘못된 event 400
{ "success": false, "message": "event must be \"enter\" or \"exit\"" }
```

### GET /api/presence?days=30 — 이벤트 목록 (사이트 웹뷰용)

NextAuth 세션 필요 (앱에서는 직접 호출하지 않고 웹뷰로 `/presence` 페이지 표시)

### 토큰 발급 방법 (사용자가 직접)
1. 브라우저에서 `https://slowmade.duckdns.org` 로그인
2. 대시보드 → 설정 → "Android 앱 연동 토큰" 섹션
3. "토큰 생성" 버튼 클릭 후 복사
4. 앱의 토큰 입력 화면에 붙여넣기

**curl로 API 테스트**:
```bash
# 이벤트 전송 테스트
curl -X POST https://slowmade.duckdns.org/api/presence \
  -H "Authorization: Bearer 여기에_토큰" \
  -H "Content-Type: application/json" \
  -d '{"event":"enter","ssid":"iptime"}'

# 응답: {"success":true,"data":{"id":"..."}}
```

---

## 3. Android 프로젝트 설정

### 3-1. 프로젝트 생성
- Android Studio → New Project → **Empty Activity**
- Language: **Kotlin**
- Min SDK: **API 26** (Android 8.0)
- Package: `org.slowmade.presence`

### 3-2. 의존성 (`app/build.gradle.kts`)
```kotlin
dependencies {
    // HTTP 클라이언트
    implementation("com.squareup.okhttp3:okhttp:4.12.0")

    // 코루틴
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")

    // ViewModel + LiveData
    implementation("androidx.lifecycle:lifecycle-viewmodel-ktx:2.7.0")
    implementation("androidx.lifecycle:lifecycle-livedata-ktx:2.7.0")

    // 암호화 SharedPreferences (토큰 안전 저장)
    implementation("androidx.security:security-crypto:1.1.0-alpha06")

    // 차트 (MPAndroidChart)
    implementation("com.github.PhilJay:MPAndroidChart:v3.1.0")

    // Navigation Component
    implementation("androidx.navigation:navigation-fragment-ktx:2.7.7")
    implementation("androidx.navigation:navigation-ui-ktx:2.7.7")
}
```

MPAndroidChart는 JitPack 저장소 필요 (`settings.gradle.kts`):
```kotlin
dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
        maven { url = uri("https://jitpack.io") }
    }
}
```

### 3-3. 권한 (`AndroidManifest.xml`)
```xml
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

### 3-4. Manifest 서비스/리시버/액티비티 등록
```xml
<application ...>

    <activity android:name=".MainActivity" ...>
        <intent-filter>
            <action android:name="android.intent.action.MAIN" />
            <category android:name="android.intent.category.LAUNCHER" />
        </intent-filter>
    </activity>

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

## 4. 앱 화면 구성 (3개 화면)

### 화면 흐름
```
LandingFragment
  ├─ 토큰 없음 → SetupFragment (토큰 입력)
  └─ 토큰 있음 → MainFragment (차트)

SetupFragment
  └─ 저장 완료 → MainFragment
```

Navigation Graph (`res/navigation/nav_graph.xml`):
```xml
<?xml version="1.0" encoding="utf-8"?>
<navigation xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:app="http://schemas.android.com/apk/res-auto"
    android:id="@+id/nav_graph"
    app:startDestination="@id/landingFragment">

    <fragment android:id="@+id/landingFragment" android:name=".LandingFragment" />
    <fragment android:id="@+id/setupFragment" android:name=".SetupFragment" />
    <fragment android:id="@+id/mainFragment" android:name=".MainFragment">
        <action android:id="@+id/action_main_to_setup"
            app:destination="@id/setupFragment" />
    </fragment>

    <action android:id="@+id/action_to_main" app:destination="@id/mainFragment" />
    <action android:id="@+id/action_to_setup" app:destination="@id/setupFragment" />
</navigation>
```

---

### 화면 1: LandingFragment
앱 로고 + 서비스 실행 상태 확인. 토큰 유무에 따라 자동 이동.

**레이아웃** (`res/layout/fragment_landing.xml`):
```xml
<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:gravity="center"
    android:orientation="vertical"
    android:padding="32dp">

    <TextView
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text="재실 감지"
        android:textSize="32sp"
        android:textStyle="bold"
        android:layout_marginBottom="8dp" />

    <TextView
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text="집 Wi-Fi 감지로 입/출을 기록합니다"
        android:textSize="14sp"
        android:alpha="0.6"
        android:layout_marginBottom="48dp" />

    <ProgressBar
        android:id="@+id/progressBar"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content" />

</LinearLayout>
```

**코드** (`LandingFragment.kt`):
```kotlin
class LandingFragment : Fragment() {
    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        val token = TokenStore.getToken(requireContext())
        if (token != null) {
            findNavController().navigate(R.id.action_to_main)
        } else {
            findNavController().navigate(R.id.action_to_setup)
        }
    }
}
```

---

### 화면 2: SetupFragment (토큰 입력)
사이트 설정 페이지에서 복사한 토큰을 붙여넣는 화면.

**레이아웃** (`res/layout/fragment_setup.xml`):
```xml
<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:padding="24dp">

    <TextView
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text="앱 연결 설정"
        android:textSize="24sp"
        android:textStyle="bold"
        android:layout_marginBottom="8dp" />

    <TextView
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text="1. slowmade.duckdns.org 에 로그인\n2. 대시보드 → 설정\n3. 'Android 앱 연동 토큰' 복사\n4. 아래에 붙여넣기"
        android:textSize="14sp"
        android:layout_marginBottom="24dp"
        android:lineSpacingExtra="4dp" />

    <com.google.android.material.textfield.TextInputLayout
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:hint="인증 토큰"
        android:layout_marginBottom="8dp">

        <com.google.android.material.textfield.TextInputEditText
            android:id="@+id/etToken"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:inputType="textVisiblePassword"
            android:fontFamily="monospace" />

    </com.google.android.material.textfield.TextInputLayout>

    <EditText
        android:id="@+id/etSsid"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:hint="집 Wi-Fi 이름 (예: iptime)"
        android:layout_marginBottom="24dp" />

    <Button
        android:id="@+id/btnSave"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:text="저장 및 시작" />

    <Button
        android:id="@+id/btnTest"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:text="연결 테스트"
        style="@style/Widget.AppCompat.Button.Borderless"
        android:layout_marginTop="8dp" />

    <TextView
        android:id="@+id/tvTestResult"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_marginTop="8dp"
        android:textSize="13sp" />

</LinearLayout>
```

**코드** (`SetupFragment.kt`):
```kotlin
class SetupFragment : Fragment() {

    private val viewModel: SetupViewModel by viewModels()

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        // 기존 값 불러오기
        val ctx = requireContext()
        view.findViewById<EditText>(R.id.etToken).setText(TokenStore.getToken(ctx))
        view.findViewById<EditText>(R.id.etSsid).setText(TokenStore.getSsid(ctx))

        view.findViewById<Button>(R.id.btnSave).setOnClickListener {
            val token = view.findViewById<EditText>(R.id.etToken).text.toString().trim()
            val ssid = view.findViewById<EditText>(R.id.etSsid).text.toString().trim()
            if (token.isEmpty() || ssid.isEmpty()) {
                Toast.makeText(ctx, "토큰과 Wi-Fi 이름을 입력하세요", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            TokenStore.saveToken(ctx, token)
            TokenStore.saveSsid(ctx, ssid)
            // 서비스 시작
            ContextCompat.startForegroundService(ctx, Intent(ctx, PresenceService::class.java))
            findNavController().navigate(R.id.action_to_main)
        }

        view.findViewById<Button>(R.id.btnTest).setOnClickListener {
            val token = view.findViewById<EditText>(R.id.etToken).text.toString().trim()
            val tvResult = view.findViewById<TextView>(R.id.tvTestResult)
            tvResult.text = "테스트 중..."
            viewModel.testConnection(token) { success ->
                tvResult.text = if (success) "✅ 연결 성공" else "❌ 연결 실패 (토큰 확인)"
            }
        }
    }
}
```

---

### 화면 3: MainFragment (차트 + 상태)
현재 재실 상태 + 최근 30일 바 차트.

**레이아웃** (`res/layout/fragment_main.xml`):
```xml
<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:padding="16dp">

    <!-- 상태 표시 -->
    <TextView
        android:id="@+id/tvStatus"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text="상태 확인 중..."
        android:textSize="20sp"
        android:textStyle="bold"
        android:layout_marginBottom="4dp" />

    <TextView
        android:id="@+id/tvLastEvent"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:textSize="13sp"
        android:alpha="0.6"
        android:layout_marginBottom="24dp" />

    <!-- 차트 -->
    <TextView
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text="일별 재실 시간 (최근 30일)"
        android:textSize="14sp"
        android:textStyle="bold"
        android:layout_marginBottom="8dp" />

    <com.github.mikephil.charting.charts.BarChart
        android:id="@+id/barChart"
        android:layout_width="match_parent"
        android:layout_height="220dp"
        android:layout_marginBottom="24dp" />

    <!-- 설정으로 이동 -->
    <Button
        android:id="@+id/btnSettings"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text="토큰 설정 변경"
        style="@style/Widget.AppCompat.Button.Borderless" />

</LinearLayout>
```

**코드** (`MainFragment.kt`):
```kotlin
class MainFragment : Fragment() {

    private val viewModel: MainViewModel by viewModels()

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        val token = TokenStore.getToken(requireContext()) ?: run {
            findNavController().navigate(R.id.action_to_setup)
            return
        }

        viewModel.load(token)

        viewModel.status.observe(viewLifecycleOwner) { status ->
            view.findViewById<TextView>(R.id.tvStatus).text =
                if (status == "enter") "🏠 재실 중" else "🚶 외출 중"
        }

        viewModel.lastEventTime.observe(viewLifecycleOwner) { time ->
            view.findViewById<TextView>(R.id.tvLastEvent).text = "마지막 기록: $time"
        }

        viewModel.dailySummary.observe(viewLifecycleOwner) { summary ->
            renderChart(view.findViewById(R.id.barChart), summary)
        }

        view.findViewById<Button>(R.id.btnSettings).setOnClickListener {
            findNavController().navigate(R.id.action_main_to_setup)
        }
    }

    private fun renderChart(chart: BarChart, summary: List<DailyEntry>) {
        val entries = summary.mapIndexed { i, d ->
            BarEntry(i.toFloat(), d.minutes / 60f)
        }
        val labels = summary.map { it.date.substring(5) } // "04-30" 형식

        val dataSet = BarDataSet(entries, "재실 시간(h)").apply {
            color = android.graphics.Color.parseColor("#6366f1")
            valueTextSize = 9f
        }

        chart.apply {
            data = BarData(dataSet)
            xAxis.valueFormatter = IndexAxisValueFormatter(labels)
            xAxis.position = XAxis.XAxisPosition.BOTTOM
            xAxis.granularity = 1f
            axisRight.isEnabled = false
            description.isEnabled = false
            legend.isEnabled = false
            animateY(500)
            invalidate()
        }
    }
}

data class DailyEntry(val date: String, val minutes: Int)
```

---

## 5. 핵심 유틸리티 코드

### TokenStore.kt — 암호화 저장소
```kotlin
import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

object TokenStore {
    private const val FILE_NAME = "presence_secure_prefs"
    private const val KEY_TOKEN = "presence_token"
    private const val KEY_SSID = "target_ssid"

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

    fun clear(context: Context) =
        prefs(context).edit().clear().apply()
}
```

### PresenceApi.kt — HTTP 클라이언트
```kotlin
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject

object PresenceApi {
    private const val BASE_URL = "https://slowmade.duckdns.org"
    private val client = OkHttpClient.Builder()
        .connectTimeout(10, java.util.concurrent.TimeUnit.SECONDS)
        .readTimeout(10, java.util.concurrent.TimeUnit.SECONDS)
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

    fun fetchSummary(token: String): Pair<String?, List<DailyEntry>> {
        // 차트 데이터는 웹뷰로 보여주거나, 별도 인증 방식 필요
        // 현재 GET /api/presence는 NextAuth 세션 필요 → 앱에서 직접 호출 불가
        // 대안: 웹뷰로 /presence 페이지 표시, 또는 토큰 기반 GET 엔드포인트 추가
        return Pair(null, emptyList())
    }
}
```

> **참고**: GET /api/presence는 NextAuth 세션 기반이라 앱에서 직접 호출 불가.
> 차트를 앱에서 네이티브로 보여주려면 서버에 토큰 기반 GET 엔드포인트를 추가해야 한다.
> 당장은 WebView로 `/presence` 페이지를 띄우거나, 차트 없이 상태만 표시하는 것도 방법이다.

### PresenceService.kt — Wi-Fi 감지 백그라운드 서비스
```kotlin
import android.app.*
import android.content.Context
import android.content.Intent
import android.net.*
import android.net.wifi.WifiManager
import android.os.Build
import android.os.IBinder
import kotlinx.coroutines.*

class PresenceService : Service() {

    private lateinit var connectivityManager: ConnectivityManager
    private lateinit var networkCallback: ConnectivityManager.NetworkCallback
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    // 빠른 연결/해제 중복 방지 (debounce)
    private var lastEventTime = 0L
    private var lastEventType = ""
    private val DEBOUNCE_MS = 3000L

    override fun onCreate() {
        super.onCreate()
        startForeground(NOTIFICATION_ID, buildNotification())
        connectivityManager = getSystemService(ConnectivityManager::class.java)
        registerCallback()
    }

    private fun registerCallback() {
        val request = NetworkRequest.Builder()
            .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
            .build()

        networkCallback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                val ssid = getConnectedSsid()
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

    private fun sendEvent(event: String, ssid: String) {
        val now = System.currentTimeMillis()
        // 동일 이벤트 3초 이내 중복 무시
        if (event == lastEventType && now - lastEventTime < DEBOUNCE_MS) return
        lastEventTime = now
        lastEventType = event

        val token = TokenStore.getToken(applicationContext) ?: return
        scope.launch {
            var retries = 0
            while (retries < 3) {
                val success = PresenceApi.sendEvent(token, event, ssid)
                if (success) break
                retries++
                delay(5000L * retries) // 5초, 10초, 15초 재시도
            }
        }
    }

    private fun getConnectedSsid(): String {
        val wifiManager = applicationContext.getSystemService(WIFI_SERVICE) as WifiManager
        return wifiManager.connectionInfo.ssid.removeSurrounding("\"")
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

### BootReceiver.kt — 부팅 후 자동 시작
```kotlin
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            val token = TokenStore.getToken(context)
            if (token != null) {
                ContextCompat.startForegroundService(
                    context, Intent(context, PresenceService::class.java)
                )
            }
        }
    }
}
```

### ViewModel 예시 (`SetupViewModel.kt`)
```kotlin
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class SetupViewModel : ViewModel() {
    fun testConnection(token: String, callback: (Boolean) -> Unit) {
        viewModelScope.launch(Dispatchers.IO) {
            val success = PresenceApi.sendEvent(token, "enter", "test")
            launch(Dispatchers.Main) { callback(success) }
        }
    }
}
```

---

## 6. 주의사항 및 트러블슈팅

### SSID가 `<unknown ssid>` 로 읽히는 경우
- Android 8.1+: `ACCESS_FINE_LOCATION` 권한 런타임 허용 필요
- Android 13+: `NEARBY_WIFI_DEVICES` 권한 런타임 허용 필요
- 권한 없이는 SSID 읽기 불가

**권한 런타임 요청** (MainActivity에 추가):
```kotlin
private fun requestPermissions() {
    val perms = if (Build.VERSION.SDK_INT >= 33) {
        arrayOf(android.Manifest.permission.NEARBY_WIFI_DEVICES)
    } else {
        arrayOf(android.Manifest.permission.ACCESS_FINE_LOCATION)
    }
    ActivityCompat.requestPermissions(this, perms, 100)
}
```

### 배터리 최적화로 서비스가 죽는 경우
설정 → 앱 → 이 앱 → 배터리 → "제한 없음" 선택.
또는 앱에서 안내:
```kotlin
val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
    data = Uri.parse("package:${packageName}")
}
startActivity(intent)
```

### enter/exit가 연속으로 중복 발생하는 경우
- PresenceService의 `DEBOUNCE_MS = 3000L` 값 조절
- 서버는 중복 저장을 허용하므로 앱에서 막아야 함

### 차트를 앱에서 네이티브로 보고 싶다면
GET /api/presence가 현재 NextAuth 세션 기반이라 앱에서 직접 호출 불가.
서버에 토큰 기반 GET 엔드포인트를 추가해야 한다:
```
GET /api/presence?days=30
Authorization: Bearer <presenceToken>
→ 해당 사용자 데이터만 반환
```
이 변경은 서버 사이드 작업이 필요하다.

---

## 7. 파일 구조

```
app/src/main/
├── java/org/slowmade/presence/
│   ├── MainActivity.kt
│   ├── LandingFragment.kt
│   ├── SetupFragment.kt
│   ├── MainFragment.kt
│   ├── SetupViewModel.kt
│   ├── MainViewModel.kt
│   ├── PresenceService.kt
│   ├── BootReceiver.kt
│   ├── PresenceApi.kt
│   ├── TokenStore.kt
│   └── DailyEntry.kt
├── res/
│   ├── layout/
│   │   ├── activity_main.xml       ← NavHostFragment 포함
│   │   ├── fragment_landing.xml
│   │   ├── fragment_setup.xml
│   │   └── fragment_main.xml
│   └── navigation/
│       └── nav_graph.xml
└── AndroidManifest.xml
```

### activity_main.xml (NavHost)
```xml
<?xml version="1.0" encoding="utf-8"?>
<FrameLayout xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:app="http://schemas.android.com/apk/res-auto"
    android:layout_width="match_parent"
    android:layout_height="match_parent">

    <androidx.fragment.app.FragmentContainerView
        android:id="@+id/nav_host_fragment"
        android:name="androidx.navigation.fragment.NavHostFragment"
        android:layout_width="match_parent"
        android:layout_height="match_parent"
        app:defaultNavHost="true"
        app:navGraph="@navigation/nav_graph" />

</FrameLayout>
```

### MainActivity.kt
```kotlin
class MainActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        requestPermissions()
    }

    private fun requestPermissions() {
        val perms = if (Build.VERSION.SDK_INT >= 33) {
            arrayOf(android.Manifest.permission.NEARBY_WIFI_DEVICES)
        } else {
            arrayOf(android.Manifest.permission.ACCESS_FINE_LOCATION)
        }
        ActivityCompat.requestPermissions(this, perms, 100)
    }
}
```

---

## 8. 개발 순서 권장

1. Android Studio 프로젝트 생성 + 의존성 추가
2. `TokenStore`, `PresenceApi` 구현
3. `SetupFragment` + 연결 테스트 버튼으로 서버 통신 확인
4. `PresenceService` 구현 + 수동 테스트 (서비스 직접 시작)
5. Wi-Fi 연결/해제 테스트 (실제 공유기 or 핫스팟 켜고 끄기)
6. `LandingFragment` → `MainFragment` 차트 구현
7. `BootReceiver` 추가 + 재부팅 후 자동 시작 확인
8. 배터리 최적화 예외 설정 안내 추가
