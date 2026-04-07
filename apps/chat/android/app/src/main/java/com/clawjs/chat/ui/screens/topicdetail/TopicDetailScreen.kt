package com.clawjs.chat.ui.screens.topicdetail

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.clawjs.chat.AppContainer
import com.clawjs.chat.R
import com.clawjs.chat.ui.components.StatusBadge
import java.util.UUID

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TopicDetailScreen(
    container: AppContainer,
    topicId: UUID,
    onBack: () -> Unit,
    onOpenConversation: (UUID) -> Unit,
) {
    val repo = container.chatRepository
    val conversations by repo.conversations.collectAsState()
    val topic = remember(topicId) { repo.topicFor(topicId) }
    val convs = remember(conversations, topicId) { repo.conversationsForTopic(topicId) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(topic?.name ?: "Topic") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null)
                    }
                },
            )
        },
    ) { padding ->
        if (convs.isEmpty()) {
            Column(
                modifier = Modifier.fillMaxSize().padding(padding),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Text(
                    stringResource(R.string.agent_no_conversations),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize().padding(padding),
            ) {
                items(convs, key = { it.id }) { conv ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onOpenConversation(conv.id) }
                            .padding(horizontal = 20.dp, vertical = 14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(conv.title, modifier = Modifier.weight(1f))
                        StatusBadge(status = conv.status)
                    }
                }
            }
        }
    }
}
