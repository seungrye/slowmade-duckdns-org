package org.slowmade.presence

import com.google.firebase.auth.FirebaseAuth
import kotlinx.coroutines.tasks.await

object AuthManager {

    fun isSignedIn(): Boolean = FirebaseAuth.getInstance().currentUser != null

    fun currentEmail(): String? = FirebaseAuth.getInstance().currentUser?.email

    suspend fun getIdToken(): String? {
        val user = FirebaseAuth.getInstance().currentUser ?: return null
        return try {
            user.getIdToken(false).await().token
        } catch (e: Exception) {
            null
        }
    }

    // Authorization 헤더 값 조합 — 단위 테스트 가능한 순수 함수
    fun buildAuthHeader(idToken: String): String = "Bearer $idToken"
}
