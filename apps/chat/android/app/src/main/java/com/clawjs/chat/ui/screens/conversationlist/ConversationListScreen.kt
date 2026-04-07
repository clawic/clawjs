package com.clawjs.chat.ui.screens.conversationlist

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.clawjs.chat.AppContainer
import com.clawjs.chat.R
import com.clawjs.chat.data.model.Conversation
import com.clawjs.chat.ui.components.AgentStrip
import com.clawjs.chat.ui.components.StatusBadge
import java.util.UUID
import androidx.compose.material3.LocalTextStyle

@Composable
fun ConversationListScreen(
    container: AppContainer,
    onOpenConversation: (UUID) -> Unit,
    onOpenAgent: (UUID) -> Unit,
    onOpenProject: (UUID) -> Unit,
    onOpenCreateAgent: () -> Unit,
    onOpenSettings: () -> Unit,
) {
    val repo = container.chatRepository
    val agents by repo.agents.collectAsState()
    val projects by repo.projects.collectAsState()
    val conversations by repo.conversations.collectAsState()
    val searchText by repo.searchText.collectAsState()
    var showSearch by remember { mutableStateOf(false) }
    val isSearching = showSearch && searchText.isNotEmpty()
    val sortedConversations = remember(conversations, searchText) { repo.sortedConversations() }
    val filteredProjects = remember(projects, searchText) { repo.filteredProjects() }
    val visibleProjectCount = 5

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = {
                    val ctx = repo.defaultConversationContext() ?: return@ExtendedFloatingActionButton
                    val id = repo.createConversation(ctx.second.id, ctx.first.id) ?: return@ExtendedFloatingActionButton
                    onOpenConversation(id)
                },
                icon = {
                    Icon(Icons.Default.Edit, contentDescription = null)
                },
                text = { Text(stringResourceOf(R.string.general_chat)) },
            )
        },
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            contentPadding = PaddingValues(bottom = 96.dp),
        ) {
            item {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(start = 20.dp, end = 20.dp, top = 16.dp, bottom = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (!showSearch) {
                        Text(
                            stringResourceOf(R.string.general_app_name),
                            style = MaterialTheme.typography.headlineLarge,
                        )
                    }
                    Box(modifier = Modifier.weight(1f))
                    if (showSearch) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier
                                .clip(RoundedCornerShape(22.dp))
                                .background(MaterialTheme.colorScheme.surfaceVariant)
                                .padding(horizontal = 12.dp, vertical = 8.dp),
                        ) {
                            Icon(
                                Icons.Default.Search,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(16.dp),
                            )
                            Box(modifier = Modifier.size(8.dp))
                            BasicTextField(
                                value = searchText,
                                onValueChange = { repo.setSearchText(it) },
                                modifier = Modifier.weight(1f),
                                textStyle = LocalTextStyle.current.copy(
                                    color = MaterialTheme.colorScheme.onSurface,
                                ),
                                cursorBrush = SolidColor(MaterialTheme.colorScheme.onSurface),
                                singleLine = true,
                            )
                            IconButton(onClick = {
                                showSearch = false
                                repo.setSearchText("")
                            }) {
                                Icon(
                                    Icons.Default.Clear,
                                    contentDescription = null,
                                    modifier = Modifier.size(16.dp),
                                )
                            }
                        }
                    } else {
                        IconButton(onClick = { showSearch = true }) {
                            Icon(
                                Icons.Default.Search,
                                contentDescription = stringResourceOf(R.string.general_search),
                            )
                        }
                        IconButton(onClick = onOpenSettings) {
                            Icon(
                                Icons.AutoMirrored.Filled.List,
                                contentDescription = stringResourceOf(R.string.settings_title),
                            )
                        }
                    }
                }
            }

            if (!isSearching) {
                item {
                    AgentStrip(
                        agents = agents,
                        canCreate = false,
                        onAgentTap = onOpenAgent,
                        onCreateTap = onOpenCreateAgent,
                    )
                }
                item {
                    Text(
                        stringResourceOf(R.string.home_projects),
                        style = MaterialTheme.typography.titleMedium,
                        modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
                    )
                }
                items(projects.take(visibleProjectCount), key = { it.id }) { project ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onOpenProject(project.id) }
                            .padding(horizontal = 20.dp, vertical = 14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Icon(Icons.Default.Folder, contentDescription = null)
                        Text(
                            project.name,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    }
                }
                if (projects.size > visibleProjectCount) {
                    item {
                        Text(
                            stringResourceOf(R.string.home_see_all),
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier
                                .padding(horizontal = 20.dp, vertical = 10.dp),
                        )
                    }
                }
                item {
                    Text(
                        stringResourceOf(R.string.home_conversations),
                        style = MaterialTheme.typography.titleMedium,
                        modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
                    )
                }
                items(sortedConversations, key = { it.id }) { conv ->
                    ConversationRow(conv, onClick = { onOpenConversation(conv.id) })
                }
            } else {
                if (filteredProjects.isNotEmpty()) {
                    item {
                        Text(
                            stringResourceOf(R.string.home_projects),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
                        )
                    }
                    items(filteredProjects, key = { it.id }) { project ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { onOpenProject(project.id) }
                                .padding(horizontal = 20.dp, vertical = 12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            Icon(
                                Icons.Default.Folder,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(16.dp),
                            )
                            Text(project.name, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                    }
                }
                if (sortedConversations.isNotEmpty()) {
                    item {
                        Text(
                            stringResourceOf(R.string.home_conversations),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
                        )
                    }
                    items(sortedConversations, key = { it.id }) { conv ->
                        ConversationRow(conv, onClick = { onOpenConversation(conv.id) })
                    }
                }
            }
        }
    }
}

@Composable
private fun ConversationRow(conversation: Conversation, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 20.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            conversation.title,
            modifier = Modifier.weight(1f),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            style = MaterialTheme.typography.bodyMedium,
        )
        StatusBadge(status = conversation.status)
    }
}

@Composable
private fun stringResourceOf(id: Int): String =
    androidx.compose.ui.res.stringResource(id)
