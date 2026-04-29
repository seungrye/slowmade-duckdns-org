package org.slowmade.presence

import android.content.Context
import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MainViewModel : ViewModel() {

    private val _status = MutableLiveData<String>("unknown")
    val status: LiveData<String> = _status

    private val _lastEventTime = MutableLiveData<String?>()
    val lastEventTime: LiveData<String?> = _lastEventTime

    // PresenceService가 이벤트 전송 후 TokenStore에 저장 → 앱 포그라운드 진입 시 여기서 읽음
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
}
