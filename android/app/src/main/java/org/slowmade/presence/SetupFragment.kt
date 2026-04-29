package org.slowmade.presence

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import androidx.navigation.fragment.findNavController
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.common.InputImage
import java.util.concurrent.Executors

class SetupFragment : Fragment(R.layout.fragment_setup) {

    private var scannedToken: String? = null
    private val cameraExecutor = Executors.newSingleThreadExecutor()

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
                == PackageManager.PERMISSION_GRANTED
            ) {
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
            provider.bindToLifecycle(
                viewLifecycleOwner,
                CameraSelector.DEFAULT_BACK_CAMERA,
                preview,
                analysis
            )
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
