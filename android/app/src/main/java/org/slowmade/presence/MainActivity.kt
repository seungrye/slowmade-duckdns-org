package org.slowmade.presence

import android.os.Build
import android.os.Bundle
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity

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
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                add(android.Manifest.permission.NEARBY_WIFI_DEVICES)
            } else {
                add(android.Manifest.permission.ACCESS_FINE_LOCATION)
            }
        }.toTypedArray()
        permissionLauncher.launch(perms)
    }
}
