package org.slowmade.presence

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AuthManagerTest {

    @Test
    fun `buildAuthHeader Bearer 형식으로 조합한다`() {
        val header = AuthManager.buildAuthHeader("test-id-token")
        assertEquals("Bearer test-id-token", header)
    }

    @Test
    fun `buildAuthHeader 빈 토큰도 형식을 유지한다`() {
        val header = AuthManager.buildAuthHeader("")
        assertEquals("Bearer ", header)
    }

    @Test
    fun `TokenStore KEY 상수가 서로 다른 값을 가진다`() {
        val keys = listOf(TokenStore.KEY_SSID, TokenStore.KEY_LAST_EVENT, TokenStore.KEY_LAST_EVENT_TIME)
        assertEquals("중복 키 없어야 함", keys.size, keys.toSet().size)
    }

    @Test
    fun `PresenceApi BASE_URL 이 https 로 시작한다`() {
        assertTrue(PresenceApi.BASE_URL.startsWith("https://"))
    }
}
