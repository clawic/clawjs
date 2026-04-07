package com.clawjs.chat.ui.screens.projectdetail

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
import androidx.compose.material.icons.filled.Folder
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
import com.clawjs.chat.ui.components.StatusBadge
import java.util.UUID

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProjectDetailScreen(
    container: AppContainer,
    projectId: UUID,
    onBack: () -> Unit,
    onOpenConversation: (UUID) -> Unit,
    onOpenTopic: (UUID) -> Unit,
) {
    val repo = container.chatRepository
    val conversations by repo.conversations.collectAsState()
    val project = remember(projectId) { repo.projectFor(projectId) }
    val convs = remember(conversations, projectId) { repo.conversationsForProject(projectId) }
    val topics = remember(projectId) { repo.topicsForProject(projectId) }
    var tab by remember { mutableIntStateOf(0) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(project?.name ?: "Project") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null)
                    }
                },
            )
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
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
                LazyColumn(Modifier.fillMaxSize()) {
                    if (topics.isNotEmpty()) {
                        item {
                            Text(
                                "Topics",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
                            )
                        }
                        items(topics, key = { it.id }) { topic ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { onOpenTopic(topic.id) }
                                    .padding(horizontal = 20.dp, vertical = 12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                Icon(Icons.Default.Folder, contentDescription = null)
                                Text(topic.name, modifier = Modifier.weight(1f))
                            }
                        }
                    }
                    if (convs.isEmpty() && topics.isEmpty()) {
                        item { EmptyState(stringResource(R.string.project_no_conversations)) }
                    } else {
                        item {
                            Text(
                                stringResource(R.string.home_conversations),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
                            )
                        }
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
