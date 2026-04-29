# Android 재실 감지 앱 — 구현 가이드

새 세션에서 이 문서를 통째로 전달하면 된다.
서버 API는 이미 완성되어 있고, Android 앱만 만들면 된다.

---

## 1. 전체 동작 흐름

```
[사용자 흐름]
앱 설치 → 랜딩 화면 → QR 스캔 화면
  → 사이트(slowmade.duckdns.org) 대시보드 → 설정 → QR 코드 생성
  → 앱 카메라로 촬영 → Wi-Fi 이름 입력 → 저장
  → 메인 화면 (상태 + 차트)

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

### QR 코드 연동 방법
1. 브라우저에서 `https://slowmade.duckdns.org` 로그인
2. 대시보드 → 설정 → "Android 앱 연동" 섹션
3. "QR 코드 생성" 버튼 클릭
4. 앱의 SetupFragment에서 카메라 스캔 → 토큰 자동 입력

QR 코드에 인코딩된 값:
```
presence://setup?token=<64자리_hex_토큰>
```

### 차트 데이터 (현재 제약)
`GET /api/presence`는 NextAuth 쿠키 세션 기반이라 앱에서 직접 호출 불가.
**현재 구현**: MainFragment에서 POST 이벤트 전송만 하고, 차트는 마지막 이벤트 상태만 표시.
**향후 개선**: 서버에 `GET /api/presence`를 Bearer 토큰도 허용하도록 수정하면 앱 네이티브 차트 가능.

### curl로 API 테스트
```bash
curl -X POST https://slowmade.duckdns.org/api/presence \
  -H "Authorization: Bearer 여기에_토큰" \
  -H "Content-Type: application/json" \
  -d '{"event":"enter","ssid":"iptime"}'

# 응답: {"success":true,"data":{"id":"..."}}
```

---

## 3. Android 프로젝트 설정

### 3-1. 프로젝트 생성
- Android Studio → New Project → **Empty Views Activity**
- Language: **Kotlin**
- Min SDK: **API 26** (Android 8.0)
- Package: `org.slowmade.presence`

### 3-2. 의존성 (`app/build.gradle.kts`)
```kotlin
dependencies {
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.fragment:fragment-ktx:1.8.1")
    implementation("com.google.android.material:material:1.12.0")

    // HTTP 클라이언트
    implementation("com.squareup.okhttp3:okhttp:4.12.0")

    // 코루틴
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")

    // ViewModel + LiveData
    implementation("androidx.lifecycle:lifecycle-viewmodel-ktx:2.8.3")
    implementation("androidx.lifecycle:lifecycle-livedata-ktx:2.8.3")

    // 암호화 SharedPreferences (토큰 안전 저장)
    implementation("androidx.security:security-crypto:1.1.0-alpha06")

    // 차트 (MPAndroidChart)
    implementation("com.github.PhilJay:MPAndroidChart:v3.1.0")

    // Navigation Component
    implementation("androidx.navigation:navigation-fragment-ktx:2.7.7")
    implementation("androidx.navigation:navigation-ui-ktx:2.7.7")

    // QR 코드 스캔 (ML Kit + CameraX)
    implementation("com.google.mlkit:barcode-scanning:17.2.0")
    implementation("androidx.camera:camera-camera2:1.3.4")
    implementation("androidx.camera:camera-lifecycle:1.3.4")
    implementation("androidx.camera:camera-view:1.3.4")
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

### 3-3. ProGuard 룰 (`proguard-rules.pro`)
```
# OkHttp
-dontwarn okhttp3.**
-dontwarn okio.**
-keepnames class okhttp3.internal.publicsuffix.PublicSuffixDatabase

# MPAndroidChart
-keep class com.github.mikephil.charting.** { *; }
```

### 3-4. 권한 (`AndroidManifest.xml`)
```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />

<!-- 카메라 (QR 스캔) -->
<uses-permission android:name="android.permission.CAMERA" />

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

### 3-5. Manifest 컴포넌트 등록
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
  ├─ 토큰 없음 → SetupFragment (QR 스캔)
  └─ 토큰 있음 → MainFragment (상태)

SetupFragment
  └─ 저장 완료 → MainFragment

MainFragment
  └─ 설정 변경 → SetupFragment
```

### Navigation Graph (`res/navigation/nav_graph.xml`)
```xml
<?xml version="1.0" encoding="utf-8"?>
<navigation xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:app="http://schemas.android.com/apk/res-auto"
    android:id="@+id/nav_graph"
    app:startDestination="@id/landingFragment">

    <fragment android:id="@+id/landingFragment"
        android:name=".LandingFragment"
        android:label="Landing">
        <action android:id="@+id/action_landing_to_setup"
            app:destination="@id/setupFragment" />
        <action android:id="@+id/action_landing_to_main"
            app:destination="@id/mainFragment" />
    </fragment>

    <fragment android:id="@+id/setupFragment"
        android:name=".SetupFragment"
        android:label="Setup">
        <action android:id="@+id/action_setup_to_main"
            app:destination="@id/mainFragment" />
    </fragment>

    <fragment android:id="@+id/mainFragment"
        android:name=".MainFragment"
        android:label="Main">
        <action android:id="@+id/action_main_to_setup"
            app:destination="@id/setupFragment" />
    </fragment>

</navigation>
```

---

### 화면 1: LandingFragment
토큰 유무 확인 후 자동 이동.

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
        android:layout_width="wrap_content"
        android:layout_height="wrap_content" />

</LinearLayout>
```

**코드** (`LandingFragment.kt`):
```kotlin
class LandingFragment : Fragment(R.layout.fragment_landing) {
    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        if (TokenStore.getToken(requireContext()) != null) {
            findNavController().navigate(R.id.action_landing_to_main)
        } else {
            findNavController().navigate(R.id.action_landing_to_setup)
        }
    }
}
```

---

### 화면 2: SetupFragment (QR 스캔)
카메라로 사이트 설정 페이지의 QR 코드를 찍으면 토큰이 자동 입력되는 화면.

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
        android:text="1. slowmade.duckdns.org 로그인\n2. 대시보드 → 설정\n3. QR 코드 생성\n4. 아래 스캔 버튼으로 촬영"
        android:textSize="14sp"
        android:lineSpacingExtra="4dp"
        android:layout_marginBottom="24dp" />

    <androidx.camera.view.PreviewView
        android:id="@+id/cameraPreview"
        android:layout_width="match_parent"
        android:layout_height="240dp"
        android:layout_marginBottom="12dp"
        android:visibility="gone" />

    <Button
        android:id="@+id/btnScan"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:text="QR 코드 스캔"
        android:layout_marginBottom="16dp" />

    <TextView
        android:id="@+id/tvScanned"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:textSize="13sp"
        android:textColor="#22c55e"
        android:visibility="gone"
        android:layout_marginBottom="16dp" />

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
        android:text="저장 및 시작"
        android:enabled="false" />

</LinearLayout>
```

**코드** (`SetupFragment.kt`):
```kotlin
import android.Manifest
import android.content.pm.PackageManager
import android.net.Uri
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import java.util.concurrent.Executors

class SetupFragment : Fragment(R.layout.fragment_setup) {

    private var scannedToken: String? = null
    private val cameraExecutor = Executors.newSingleThreadExecutor()

    // 권한 요청 결과 처리 (ActivityResultLauncher 방식 — deprecated requestPermissions 대체)
    private val cameraPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) startCamera()
            else Toast.makeText(requireContext(), "카메라 권한이 필요합니다", Toast.LENGTH_SHORT).show()
        }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        view.findViewById<EditText>(R.id.etSsid).setText(TokenStore.getSsid(requireContext()))

        view.findViewById<Button>(R.id.btnScan).setOnClickListener {
            if (ContextCompat.checkSelfPermission(requireContext(), Manifest.permission.CAMERA)
                == PackageManager.PERMISSION_GRANTED) {
                startCamera()
            } else {
                cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
            }
        }

        view.findViewById<Button>(R.id.btnSave).setOnClickListener {
            val token = scannedToken ?: return@setOnClickListener
            val ssid = view.findViewById<EditText>(R.id.etSsid).text.toString().trim()
            if (ssid.isEmpty()) {
                Toast.makeText(requireContext(), "Wi-Fi 이름을 입력하세요", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            TokenStore.saveToken(requireContext(), token)
            TokenStore.saveSsid(requireContext(), ssid)
            ContextCompat.startForegroundService(
                requireContext(), Intent(requireContext(), PresenceService::class.java)
            )
            findNavController().navigate(R.id.action_setup_to_main)
        }
    }

    private fun startCamera() {
        val view = requireView()
        val previewView = view.findViewById<PreviewView>(R.id.cameraPreview)
        previewView.visibility = View.VISIBLE

        val future = ProcessCameraProvider.getInstance(requireContext())
        future.addListener({
            val provider = future.get()
            val preview = Preview.Builder().build().also {
                it.setSurfaceProvider(previewView.surfaceProvider)
            }
            val analysis = ImageAnalysis.Builder()
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build()
                .also { it.setAnalyzer(cameraExecutor, ::analyzeImage) }

            provider.unbindAll()
            provider.bindToLifecycle(viewLifecycleOwner, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis)
        }, ContextCompat.getMainExecutor(requireContext()))
    }

    @androidx.annotation.OptIn(androidx.camera.core.ExperimentalGetImage::class)
    private fun analyzeImage(proxy: ImageProxy) {
        val mediaImage = proxy.image ?: run { proxy.close(); return }
        val image = InputImage.fromMediaImage(mediaImage, proxy.imageInfo.rotationDegrees)

        BarcodeScanning.getClient().process(image)
            .addOnSuccessListener { barcodes ->
                for (barcode in barcodes) {
                    val raw = barcode.rawValue ?: continue
                    val token = Uri.parse(raw).getQueryParameter("token") ?: continue
                    scannedToken = token
                    requireActivity().runOnUiThread { onScanSuccess() }
                    break
                }
            }
            .addOnCompleteListener { proxy.close() }
    }

    private fun onScanSuccess() {
        val view = requireView()
        view.findViewById<TextView>(R.id.tvScanned).apply {
            text = "✅ 스캔 완료"
            visibility = View.VISIBLE
        }
        view.findViewById<PreviewView>(R.id.cameraPreview).visibility = View.GONE
        view.findViewById<Button>(R.id.btnSave).isEnabled = true
    }

    override fun onDestroyView() {
        super.onDestroyView()
        cameraExecutor.shutdown()
    }
}
```

---

### 화면 3: MainFragment (상태 표시)
현재 재실 상태와 마지막 이벤트 시각 표시.

> **참고**: 앱 네이티브 차트는 서버 GET /api/presence가 현재 NextAuth 세션 전용이라 불가.
> 현재는 상태(재실 중/외출 중)와 마지막 기록 시각만 표시한다.
> 차트는 기기 브라우저로 `https://slowmade.duckdns.org/presence` 접속해서 확인.

**레이아웃** (`res/layout/fragment_main.xml`):
```xml
<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:gravity="center"
    android:padding="32dp">

    <TextView
        android:id="@+id/tvStatus"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text="상태 확인 중..."
        android:textSize="28sp"
        android:textStyle="bold"
        android:layout_marginBottom="8dp" />

    <TextView
        android:id="@+id/tvLastEvent"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:textSize="13sp"
        android:alpha="0.6"
        android:layout_marginBottom="48dp" />

    <TextView
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text="차트는 브라우저에서 확인하세요"
        android:textSize="12sp"
        android:alpha="0.4"
        android:layout_marginBottom="8dp" />

    <TextView
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text="slowmade.duckdns.org/presence"
        android:textSize="12sp"
        android:alpha="0.4"
        android:layout_marginBottom="48dp" />

    <Button
        android:id="@+id/btnSettings"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text="토큰 재설정"
        style="@style/Widget.AppCompat.Button.Borderless" />

</LinearLayout>
```

**코드** (`MainFragment.kt`):
```kotlin
class MainFragment : Fragment(R.layout.fragment_main) {

    private val viewModel: MainViewModel by viewModels()

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        if (TokenStore.getToken(requireContext()) == null) {
            findNavController().navigate(R.id.action_main_to_setup)
            return
        }

        viewModel.status.observe(viewLifecycleOwner) { status ->
            view.findViewById<TextView>(R.id.tvStatus).text =
                if (status == "enter") "🏠 재실 중" else "🚶 외출 중"
        }

        viewModel.lastEventTime.observe(viewLifecycleOwner) { time ->
            view.findViewById<TextView>(R.id.tvLastEvent).text =
                if (time != null) "마지막 기록: $time" else ""
        }

        view.findViewById<Button>(R.id.btnSettings).setOnClickListener {
            findNavController().navigate(R.id.action_main_to_setup)
        }
    }
}
```

---

## 5. ViewModel

### MainViewModel.kt
```kotlin
import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.*

class MainViewModel : ViewModel() {

    private val _status = MutableLiveData<String>("unknown")
    val status: LiveData<String> = _status

    private val _lastEventTime = MutableLiveData<String?>()
    val lastEventTime: LiveData<String?> = _lastEventTime

    // 앱 내 마지막 이벤트를 메모리에 보관
    // (GET /api/presence가 NextAuth 세션 기반이라 직접 조회 불가)
    fun onEventSent(event: String) {
        _status.postValue(event)
        val formatted = SimpleDateFormat("MM/dd HH:mm", Locale.KOREA).format(Date())
        _lastEventTime.postValue(formatted)
    }
}
```

> PresenceService가 이벤트를 전송할 때 `MainViewModel`에 직접 접근할 수 없다.
> 대신 `LocalBroadcastManager` 또는 SharedPreferences로 마지막 이벤트를 공유한다.
> 가장 단순한 방법: `TokenStore`에 `lastEvent`, `lastEventTime` 추가.

**TokenStore에 추가**:
```kotlin
private const val KEY_LAST_EVENT = "last_event"
private const val KEY_LAST_EVENT_TIME = "last_event_time"

fun saveLastEvent(context: Context, event: String) {
    val time = System.currentTimeMillis().toString()
    prefs(context).edit()
        .putString(KEY_LAST_EVENT, event)
        .putString(KEY_LAST_EVENT_TIME, time)
        .apply()
}

fun getLastEvent(context: Context): String? =
    prefs(context).getString(KEY_LAST_EVENT, null)

fun getLastEventTime(context: Context): Long? =
    prefs(context).getString(KEY_LAST_EVENT_TIME, null)?.toLongOrNull()
```

**MainViewModel 수정** (TokenStore에서 읽기):
```kotlin
fun load(context: Context) {
    viewModelScope.launch(Dispatchers.IO) {
        val event = TokenStore.getLastEvent(context)
        val timeMs = TokenStore.getLastEventTime(context)
        _status.postValue(event ?: "unknown")
        if (timeMs != null) {
            val formatted = SimpleDateFormat("MM/dd HH:mm", Locale.KOREA).format(Date(timeMs))
            _lastEventTime.postValue(formatted)
        }
    }
}
```

---

## 6. 핵심 유틸리티 코드

### TokenStore.kt — 암호화 저장소
```kotlin
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
```

### PresenceApi.kt — HTTP 클라이언트
```kotlin
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
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
}
```

### PresenceService.kt — Wi-Fi 감지 백그라운드 서비스
```kotlin
import android.app.*
import android.content.Context
import android.content.Intent
import android.net.*
import android.net.wifi.WifiInfo
import android.os.Build
import android.os.IBinder
import kotlinx.coroutines.*

class PresenceService : Service() {

    private lateinit var connectivityManager: ConnectivityManager
    private lateinit var networkCallback: ConnectivityManager.NetworkCallback
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    // @Volatile — NetworkCallback 스레드와 코루틴이 동시 접근하므로 필수
    @Volatile private var lastEventType = ""
    @Volatile private var lastEventTime = 0L
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
            // Android 10+ 방식
            val wifiInfo = capabilities.transportInfo as? WifiInfo ?: return null
            wifiInfo.ssid.removeSurrounding("\"").takeIf { it != "<unknown ssid>" }
        } else {
            // Android 9 이하 (deprecated이지만 API 26 min이므로 필요)
            @Suppress("DEPRECATION")
            val wm = applicationContext.getSystemService(Context.WIFI_SERVICE) as android.net.wifi.WifiManager
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
        TokenStore.saveLastEvent(applicationContext, event) // MainFragment 표시용

        scope.launch {
            repeat(3) { attempt ->
                if (PresenceApi.sendEvent(token, event, ssid)) return@launch
                delay(5000L * (attempt + 1)) // 5초, 10초, 15초
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
```

### BootReceiver.kt — 부팅 후 자동 시작
```kotlin
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED
            && TokenStore.getToken(context) != null) {
            ContextCompat.startForegroundService(
                context, Intent(context, PresenceService::class.java)
            )
        }
    }
}
```

### MainActivity.kt
```kotlin
import androidx.activity.result.contract.ActivityResultContracts

class MainActivity : AppCompatActivity() {

    private val permissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        requestRequiredPermissions()
    }

    private fun requestRequiredPermissions() {
        val perms = buildList {
            add(android.Manifest.permission.CAMERA)
            if (Build.VERSION.SDK_INT >= 33) {
                add(android.Manifest.permission.NEARBY_WIFI_DEVICES)
            } else {
                add(android.Manifest.permission.ACCESS_FINE_LOCATION)
            }
        }.toTypedArray()
        permissionLauncher.launch(perms)
    }
}
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

---

## 7. 주의사항 및 트러블슈팅

### SSID가 `<unknown ssid>` 로 읽히는 경우
- 위치/Wi-Fi 권한이 런타임에 허용되지 않은 경우
- `onCapabilitiesChanged` 사용해도 권한 없으면 `<unknown ssid>` 반환
- MainActivity에서 권한 요청 후 재시도 유도

### 배터리 최적화로 서비스가 죽는 경우
```kotlin
val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
    data = Uri.parse("package:${packageName}")
}
startActivity(intent)
```
설정에서 직접: 배터리 → 앱 → 이 앱 → "제한 없음"

### enter/exit가 중복 발생하는 경우
`PresenceService.DEBOUNCE_MS` 값(기본 3000ms)을 늘린다.
서버는 중복 이벤트를 그대로 저장하므로 앱에서 반드시 막아야 한다.

### Android 9(API 28) 이하에서 SSID 읽기
`WifiManager.connectionInfo`가 deprecated이지만 API 26이 min SDK이므로 분기 처리 필요.
`getSsidFromCapabilities()` 코드가 이미 분기 처리되어 있다.

---

## 8. 파일 구조

```
app/src/main/
├── java/org/slowmade/presence/
│   ├── MainActivity.kt
│   ├── LandingFragment.kt
│   ├── SetupFragment.kt
│   ├── MainFragment.kt
│   ├── MainViewModel.kt
│   ├── PresenceService.kt
│   ├── BootReceiver.kt
│   ├── PresenceApi.kt
│   └── TokenStore.kt          ← DailyEntry 불필요 (차트 미구현)
├── res/
│   ├── layout/
│   │   ├── activity_main.xml
│   │   ├── fragment_landing.xml
│   │   ├── fragment_setup.xml
│   │   └── fragment_main.xml
│   └── navigation/
│       └── nav_graph.xml
├── proguard-rules.pro
└── AndroidManifest.xml
```

---

## 9. 개발 순서 권장

1. 프로젝트 생성 + 의존성/ProGuard 설정
2. `TokenStore`, `PresenceApi` 구현
3. `SetupFragment` QR 스캔 → curl로 서버 통신 확인
4. `PresenceService` 구현 → 수동으로 서비스 시작해서 Wi-Fi 연결/해제 테스트
5. `LandingFragment` → `MainFragment` 상태 표시 연결
6. `BootReceiver` + 재부팅 테스트
7. 배터리 최적화 예외 설정 안내 추가
