package com.clawjs.chat

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import com.clawjs.chat.data.model.AppearanceMode
import com.clawjs.chat.ui.navigation.NavGraph
import com.clawjs.chat.ui.theme.ClawJSTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val container = (application as ClawJSApplication).container

        setContent {
            val settings by container.settingsStore.state.collectAsState(
                initial = com.clawjs.chat.data.settings.SettingsSnapshot()
            )
            ClawJSTheme(appearance = AppearanceMode.fromKey(settings.appearanceKey)) {
                NavGraph(container = container)
            }
        }
    }
}
