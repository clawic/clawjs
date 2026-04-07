package com.clawjs.chat.util

import androidx.appcompat.app.AppCompatDelegate
import com.clawjs.chat.data.model.AppearanceMode

object AppearanceManager {
    fun apply(mode: AppearanceMode) {
        val nightMode = when (mode) {
            AppearanceMode.System -> AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM
            AppearanceMode.Light -> AppCompatDelegate.MODE_NIGHT_NO
            AppearanceMode.Dark -> AppCompatDelegate.MODE_NIGHT_YES
        }
        AppCompatDelegate.setDefaultNightMode(nightMode)
    }
}
