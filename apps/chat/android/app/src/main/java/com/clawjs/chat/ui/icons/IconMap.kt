package com.clawjs.chat.ui.icons

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.MenuBook
import androidx.compose.material.icons.filled.AccountTree
import androidx.compose.material.icons.filled.Assignment
import androidx.compose.material.icons.filled.Brush
import androidx.compose.material.icons.filled.Campaign
import androidx.compose.material.icons.filled.Code
import androidx.compose.material.icons.filled.DirectionsRun
import androidx.compose.material.icons.filled.Dns
import androidx.compose.material.icons.filled.DonutLarge
import androidx.compose.material.icons.filled.Gavel
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.Psychology
import androidx.compose.material.icons.filled.Storage
import androidx.compose.material.icons.filled.TrendingUp
import androidx.compose.ui.graphics.vector.ImageVector

/**
 * Maps the SF-Symbol keys stored on [com.clawjs.chat.data.model.Agent.icon]
 * (and the switch in ChatRepository.bootstrap) to Material Icons.
 */
object IconMap {
    fun forKey(key: String): ImageVector = when (key) {
        "server.rack" -> Icons.Default.Dns
        "chart.line.uptrend.xyaxis" -> Icons.Default.TrendingUp
        "chart.pie" -> Icons.Default.DonutLarge
        "map" -> Icons.Default.Map
        "text.book.closed" -> Icons.AutoMirrored.Filled.MenuBook
        "paintbrush", "paintbrush.fill" -> Icons.Default.Brush
        "scale.3d" -> Icons.Default.Gavel
        "figure.run" -> Icons.Default.DirectionsRun
        "list.clipboard" -> Icons.Default.Assignment
        "megaphone" -> Icons.Default.Campaign
        "cylinder" -> Icons.Default.Storage
        "lock.shield" -> Icons.Default.Lock
        "chevron.left.forwardslash.chevron.right" -> Icons.Default.Code
        "brain.head.profile" -> Icons.Default.Psychology
        else -> Icons.Default.AccountTree
    }
}
