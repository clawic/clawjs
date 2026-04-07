package com.clawjs.chat.ui.screens.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.clawjs.chat.AppContainer
import com.clawjs.chat.R
import com.clawjs.chat.data.model.AppLanguage
import com.clawjs.chat.data.model.AppearanceMode
import com.clawjs.chat.data.settings.SettingsSnapshot
import com.clawjs.chat.util.AppearanceManager
import com.clawjs.chat.util.LocaleManager
import kotlinx.coroutines.launch
import androidx.compose.foundation.text.KeyboardOptions

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(container: AppContainer, onBack: () -> Unit) {
    val store = container.settingsStore
    val snapshot by store.state.collectAsState(initial = SettingsSnapshot())
    val scope = rememberCoroutineScope()
    var showDeleteDialog by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.settings_title)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null)
                    }
                },
            )
        },
    ) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(bottom = 24.dp),
        ) {
            item {
                SectionHeader(stringResource(R.string.settings_appearance))
                val current = AppearanceMode.fromKey(snapshot.appearanceKey)
                AppearanceMode.entries.forEach { mode ->
                    RadioRow(
                        label = when (mode) {
                            AppearanceMode.System -> stringResource(R.string.appearance_system)
                            AppearanceMode.Light -> stringResource(R.string.appearance_light)
                            AppearanceMode.Dark -> stringResource(R.string.appearance_dark)
                        },
                        selected = mode == current,
                        onClick = {
                            scope.launch { store.updateAppearance(mode) }
                            AppearanceManager.apply(mode)
                        },
                    )
                }
            }

            item {
                SectionHeader(stringResource(R.string.settings_language))
                val currentTag = snapshot.appLanguage
                AppLanguage.entries.forEach { lang ->
                    RadioRow(
                        label = if (lang == AppLanguage.System)
                            stringResource(R.string.settings_language_system)
                        else
                            lang.displayName,
                        selected = lang.tag == currentTag,
                        onClick = {
                            scope.launch { store.updateAppLanguage(lang.tag) }
                            LocaleManager.apply(lang.tag)
                        },
                    )
                }
            }

            item {
                SectionHeader(stringResource(R.string.settings_notifications))
                SwitchRow(
                    label = stringResource(R.string.settings_notifications),
                    checked = snapshot.notificationsEnabled,
                    onChange = { scope.launch { store.updateNotifications(it) } },
                )
                SwitchRow(
                    label = stringResource(R.string.settings_sound),
                    checked = snapshot.soundEnabled,
                    onChange = { scope.launch { store.updateSound(it) } },
                )
                SwitchRow(
                    label = stringResource(R.string.settings_haptics),
                    checked = snapshot.hapticEnabled,
                    onChange = { scope.launch { store.updateHaptic(it) } },
                )
            }

            item {
                SectionHeader("Relay")
                InlineTextField(
                    label = "Base URL",
                    value = snapshot.relayBaseUrl,
                    onChange = { scope.launch { store.updateRelayBaseUrl(it) } },
                )
                InlineTextField(
                    label = "Tenant ID",
                    value = snapshot.relayTenantId,
                    onChange = { scope.launch { store.updateRelayTenantId(it) } },
                )
                InlineTextField(
                    label = "Email",
                    value = snapshot.relayEmail,
                    onChange = { scope.launch { store.updateRelayEmail(it) } },
                    keyboardType = KeyboardType.Email,
                )
                InlineTextField(
                    label = "Password",
                    value = snapshot.relayPassword,
                    onChange = { scope.launch { store.updateRelayPassword(it) } },
                    isPassword = true,
                )
                Text(
                    "Relay defaults match the iOS app (10.0.2.2:4410 on emulator).",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
                )
            }

            item {
                SectionHeader(stringResource(R.string.settings_data))
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { showDeleteDialog = true }
                        .padding(horizontal = 20.dp, vertical = 16.dp),
                ) {
                    Text(
                        stringResource(R.string.settings_delete_all_conversations),
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }
        }
    }

    if (showDeleteDialog) {
        AlertDialog(
            onDismissRequest = { showDeleteDialog = false },
            title = { Text(stringResource(R.string.settings_delete_all_conversations)) },
            text = { Text(stringResource(R.string.settings_delete_all_alert)) },
            confirmButton = {
                TextButton(onClick = {
                    container.chatRepository.deleteAllConversations()
                    showDeleteDialog = false
                }) { Text(stringResource(R.string.general_delete)) }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteDialog = false }) {
                    Text(stringResource(R.string.general_cancel))
                }
            },
        )
    }
}

@Composable
private fun SectionHeader(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(horizontal = 20.dp, vertical = 12.dp),
    )
}

@Composable
private fun RadioRow(label: String, selected: Boolean, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 20.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        RadioButton(selected = selected, onClick = onClick)
        Text(label)
    }
}

@Composable
private fun SwitchRow(label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, modifier = Modifier.weight(1f))
        Switch(checked = checked, onCheckedChange = onChange)
    }
}

@Composable
private fun InlineTextField(
    label: String,
    value: String,
    onChange: (String) -> Unit,
    keyboardType: KeyboardType = KeyboardType.Text,
    isPassword: Boolean = false,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(
            label,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(12.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant)
                .padding(horizontal = 14.dp, vertical = 12.dp),
        ) {
            BasicTextField(
                value = value,
                onValueChange = onChange,
                modifier = Modifier.fillMaxWidth(),
                textStyle = LocalTextStyle.current.copy(
                    color = MaterialTheme.colorScheme.onSurface,
                ),
                cursorBrush = SolidColor(MaterialTheme.colorScheme.onSurface),
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
                visualTransformation = if (isPassword)
                    PasswordVisualTransformation()
                else androidx.compose.ui.text.input.VisualTransformation.None,
            )
        }
    }
}
