package com.clawjs.chat

import android.content.Context
import com.clawjs.chat.data.remote.ApiClient
import com.clawjs.chat.data.settings.SettingsStore
import com.clawjs.chat.domain.ChatRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob

/**
 * Lightweight manual DI container. Mirrors the iOS pattern where [ChatService]
 * and [APIService] are simple singletons injected through @EnvironmentObject.
 */
class AppContainer(context: Context) {
    val appScope: CoroutineScope = CoroutineScope(SupervisorJob())
    val settingsStore: SettingsStore = SettingsStore(context.applicationContext)
    val apiClient: ApiClient = ApiClient(settingsStore)
    val chatRepository: ChatRepository = ChatRepository(apiClient, appScope)
}
