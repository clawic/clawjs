package com.clawjs.chat.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import com.clawjs.chat.data.model.AppearanceMode

private val LightColors = lightColorScheme(
    background = ClawLightBackground,
    surface = ClawLightSurface,
    surfaceVariant = ClawLightSurfaceVariant,
    onSurface = ClawLightOnSurface,
    onSurfaceVariant = ClawLightSecondaryText,
    primary = ClawLightAccent,
    secondary = ClawLightSecondaryText,
)

private val DarkColors = darkColorScheme(
    background = ClawDarkBackground,
    surface = ClawDarkSurface,
    surfaceVariant = ClawDarkSurfaceVariant,
    onSurface = ClawDarkOnSurface,
    onSurfaceVariant = ClawDarkSecondaryText,
    primary = ClawDarkAccent,
    secondary = ClawDarkSecondaryText,
)

@Composable
fun ClawJSTheme(
    appearance: AppearanceMode = AppearanceMode.System,
    content: @Composable () -> Unit,
) {
    val useDark = when (appearance) {
        AppearanceMode.System -> isSystemInDarkTheme()
        AppearanceMode.Light -> false
        AppearanceMode.Dark -> true
    }
    MaterialTheme(
        colorScheme = if (useDark) DarkColors else LightColors,
        typography = ClawTypography,
        content = content,
    )
}
