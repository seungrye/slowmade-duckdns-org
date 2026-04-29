package org.slowmade.presence

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED
            && TokenStore.getToken(context) != null
        ) {
            ContextCompat.startForegroundService(
                context, Intent(context, PresenceService::class.java)
            )
        }
    }
}
