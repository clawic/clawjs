package com.clawjs.chat.ui.screens.agentdetail

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
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.clawjs.chat.AppContainer
import com.clawjs.chat.R
import com.clawjs.chat.ui.components.Avatar
import com.clawjs.chat.ui.components.StatusBadge
import java.util.UUID

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AgentDetailScreen(
    container: AppContainer,
    agentId: UUID,
    onBack: () -> Unit,
    onOpenConversation: (UUID) -> Unit,
) {
    val repo = container.chatRepository
    val conversations by repo.conversations.collectAsState()
    val agent = remember(agentId) { repo.agentFor(agentId) }
    val agentConvs = remember(conversations, agentId) { repo.conversationsForAgent(agentId) }
    var tab by remember { mutableIntStateOf(0) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(agent?.name ?: "Agent") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null)
                    }
                },
            )
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(20.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                Avatar(agent = agent, size = 64.dp)
                Column {
                    Text(
                        agent?.name.orEmpty(),
                        style = MaterialTheme.typography.titleLarge,
                    )
                    Text(
                        agent?.role.orEmpty(),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            TabRow(selectedTabIndex = tab) {
                Tab(
                    selected = tab == 0,
                    onClick = { tab = 0 },
                    text = { Text(stringResource(R.string.general_chats)) },
                )
                Tab(
                    selected = tab == 1,
                    onClick = { tab = 1 },
                    text = { Text(stringResource(R.string.general_documents)) },
                )
            }
            if (tab == 0) {
                if (agentConvs.isEmpty()) {
                    EmptyState(stringResource(R.string.agent_no_conversations))
                } else {
                    LazyColumn(Modifier.fillMaxSize()) {
                        items(agentConvs, key = { it.id }) { conv ->
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
            } else {
                EmptyState(stringResource(R.string.general_documents))
            }
        }
    }
}

@Composable
private fun EmptyState(text: String) {
    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(text, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
