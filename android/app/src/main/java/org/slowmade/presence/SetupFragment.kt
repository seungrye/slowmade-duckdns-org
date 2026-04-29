package org.slowmade.presence

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import androidx.navigation.fragment.findNavController
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.android.gms.common.api.ApiException
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.GoogleAuthProvider

class SetupFragment : Fragment(R.layout.fragment_setup) {

    private val signInLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val task = GoogleSignIn.getSignedInAccountFromIntent(result.data)
            try {
                val account = task.getResult(ApiException::class.java)
                val credential = GoogleAuthProvider.getCredential(account.idToken, null)
                FirebaseAuth.getInstance().signInWithCredential(credential)
                    .addOnSuccessListener { onSignInSuccess(it.user?.email) }
                    .addOnFailureListener {
                        Toast.makeText(requireContext(), "로그인 실패: ${it.message}", Toast.LENGTH_SHORT).show()
                    }
            } catch (e: ApiException) {
                Toast.makeText(requireContext(), "Google 로그인 실패 (${e.statusCode})", Toast.LENGTH_SHORT).show()
            }
        }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        view.findViewById<EditText>(R.id.etSsid).setText(TokenStore.getSsid(requireContext()))

        // 이미 로그인된 경우 상태 표시
        if (AuthManager.isSignedIn()) {
            onSignInSuccess(AuthManager.currentEmail())
        }

        view.findViewById<Button>(R.id.btnGoogleSignIn).setOnClickListener {
            launchGoogleSignIn()
        }

        view.findViewById<Button>(R.id.btnSave).setOnClickListener {
            if (!AuthManager.isSignedIn()) {
                Toast.makeText(requireContext(), "먼저 Google 계정으로 로그인하세요", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            val ssid = view.findViewById<EditText>(R.id.etSsid).text.toString().trim()
            if (ssid.isEmpty()) {
                Toast.makeText(requireContext(), "Wi-Fi 이름을 입력하세요", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            TokenStore.saveSsid(requireContext(), ssid)
            ContextCompat.startForegroundService(
                requireContext(), Intent(requireContext(), PresenceService::class.java)
            )
            findNavController().navigate(R.id.action_setup_to_main)
        }
    }

    private fun launchGoogleSignIn() {
        val gso = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestIdToken(getString(R.string.default_web_client_id))
            .requestEmail()
            .build()
        signInLauncher.launch(GoogleSignIn.getClient(requireActivity(), gso).signInIntent)
    }

    private fun onSignInSuccess(email: String?) {
        val view = requireView()
        view.findViewById<TextView>(R.id.tvSignInStatus).apply {
            text = "✅ ${email ?: "로그인 완료"}"
            visibility = View.VISIBLE
        }
        view.findViewById<Button>(R.id.btnGoogleSignIn).visibility = View.GONE
        view.findViewById<Button>(R.id.btnSave).isEnabled = true
    }
}
