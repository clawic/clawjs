package com.clawjs.chat

import android.app.Application
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.os.LocaleListCompat
import com.clawjs.chat.data.model.AppearanceMode
import com.clawjs.chat.util.AppearanceManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

class ClawJSApplication : Application() {

    lateinit var container: AppContainer
        private set

    private val appScope = CoroutineScope(SupervisorJob())

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)

        // Apply persisted appearance + locale before any UI is shown. We read
        // them synchronously on first use of the Flows. DataStore is async so
        // the first composition may briefly use defaults, which is acceptable.
        appScope.launch {
            val settings = container.settingsStore.state.first()
            AppearanceManager.apply(AppearanceMode.fromKey(settings.appearanceKey))
            val lang = settings.appLanguage
            if (lang.isNotEmpty()) {
                AppCompatDelegate.setApplicationLocales(
                    LocaleListCompat.forLanguageTags(lang)
                )
            }
            container.chatRepository.bootstrap()
        }
    }
}
