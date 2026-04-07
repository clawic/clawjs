package com.clawjs.chat.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.clawjs.chat.data.model.Agent
import com.clawjs.chat.ui.icons.IconMap

@Composable
fun Avatar(
    agent: Agent?,
    size: Dp = 44.dp,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .size(size)
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.surfaceVariant),
        contentAlignment = Alignment.Center,
    ) {
        if (agent != null) {
            Icon(
                imageVector = IconMap.forKey(agent.icon),
                contentDescription = agent.name,
                tint = MaterialTheme.colorScheme.onSurface,
            )
        } else {
            Text("?", color = MaterialTheme.colorScheme.onSurface)
        }
    }
}
