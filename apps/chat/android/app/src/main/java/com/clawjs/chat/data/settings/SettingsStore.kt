package com.clawjs.chat.data.settings

import android.content.Context
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.clawjs.chat.data.model.AppearanceMode
import com.clawjs.chat.data.remote.RelayConfig
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore(name = "clawjs_settings")

/**
 * DataStore-backed mirror of iOS `UserDefaults` keys used by ChatService and
 * SettingsView (see APIService.swift relayConfig() + SettingsView.swift).
 */
class SettingsStore(private val context: Context) {

    private object Keys {
        val RELAY_BASE_URL = stringPreferencesKey("relayBaseURL")
        val RELAY_TENANT_ID = stringPreferencesKey("relayTenantId")
        val RELAY_EMAIL = stringPreferencesKey("relayEmail")
        val RELAY_PASSWORD = stringPreferencesKey("relayPassword")
        val APP_LANGUAGE = stringPreferencesKey("appLanguage")
        val APPEARANCE = stringPreferencesKey("selectedAppearance")
        val NOTIFICATIONS = booleanPreferencesKey("notificationsEnabled")
        val SOUND = booleanPreferencesKey("soundEnabled")
        val HAPTIC = booleanPreferencesKey("hapticEnabled")
    }

    val state: Flow<SettingsSnapshot> = context.dataStore.data.map { prefs ->
        prefs.toSnapshot()
    }

    suspend fun currentSnapshot(): SettingsSnapshot = state.first()

    suspend fun currentConfig(): RelayConfig = currentSnapshot().relayConfig

    suspend fun updateRelayBaseUrl(value: String) =
        context.dataStore.edit { it[Keys.RELAY_BASE_URL] = value }

    suspend fun updateRelayTenantId(value: String) =
        context.dataStore.edit { it[Keys.RELAY_TENANT_ID] = value }

    suspend fun updateRelayEmail(value: String) =
        context.dataStore.edit { it[Keys.RELAY_EMAIL] = value }

    suspend fun updateRelayPassword(value: String) =
        context.dataStore.edit { it[Keys.RELAY_PASSWORD] = value }

    suspend fun updateAppLanguage(tag: String) =
        context.dataStore.edit { it[Keys.APP_LANGUAGE] = tag }

    suspend fun updateAppearance(mode: AppearanceMode) =
        context.dataStore.edit { it[Keys.APPEARANCE] = mode.key }

    suspend fun updateNotifications(enabled: Boolean) =
        context.dataStore.edit { it[Keys.NOTIFICATIONS] = enabled }

    suspend fun updateSound(enabled: Boolean) =
        context.dataStore.edit { it[Keys.SOUND] = enabled }

    suspend fun updateHaptic(enabled: Boolean) =
        context.dataStore.edit { it[Keys.HAPTIC] = enabled }

    private fun Preferences.toSnapshot() = SettingsSnapshot(
        relayBaseUrl = this[Keys.RELAY_BASE_URL] ?: RelayConfig.DEFAULT_BASE_URL,
        relayTenantId = this[Keys.RELAY_TENANT_ID] ?: RelayConfig.DEFAULT_TENANT_ID,
        relayEmail = this[Keys.RELAY_EMAIL] ?: RelayConfig.DEFAULT_EMAIL,
        relayPassword = this[Keys.RELAY_PASSWORD] ?: RelayConfig.DEFAULT_PASSWORD,
        appLanguage = this[Keys.APP_LANGUAGE] ?: "",
        appearanceKey = this[Keys.APPEARANCE] ?: AppearanceMode.System.key,
        notificationsEnabled = this[Keys.NOTIFICATIONS] ?: true,
        soundEnabled = this[Keys.SOUND] ?: true,
        hapticEnabled = this[Keys.HAPTIC] ?: true,
    )
}

data class SettingsSnapshot(
    val relayBaseUrl: String = RelayConfig.DEFAULT_BASE_URL,
    val relayTenantId: String = RelayConfig.DEFAULT_TENANT_ID,
    val relayEmail: String = RelayConfig.DEFAULT_EMAIL,
    val relayPassword: String = RelayConfig.DEFAULT_PASSWORD,
    val appLanguage: String = "",
    val appearanceKey: String = AppearanceMode.System.key,
    val notificationsEnabled: Boolean = true,
    val soundEnabled: Boolean = true,
    val hapticEnabled: Boolean = true,
) {
    val relayConfig: RelayConfig
        get() = RelayConfig(relayBaseUrl, relayTenantId, relayEmail, relayPassword)
}
