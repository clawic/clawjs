package com.clawjs.chat.ui.screens.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.clawjs.chat.AppContainer
import com.clawjs.chat.R
import com.clawjs.chat.data.model.ConversationStatus
import com.clawjs.chat.data.model.Message
import com.clawjs.chat.data.model.MessageRole
import com.clawjs.chat.ui.components.ChatInputBar
import com.clawjs.chat.ui.components.ThinkingIndicator
import java.util.UUID

@Composable
fun ChatScreen(
    container: AppContainer,
    conversationId: UUID,
    onBack: () -> Unit,
) {
    val repo = container.chatRepository
    val conversations by repo.conversations.collectAsState()
    val conversation = remember(conversations, conversationId) {
        conversations.firstOrNull { it.id == conversationId }
    }
    val agent = conversation?.agentId?.let { repo.agentFor(it) }
    val project = conversation?.projectId?.let { repo.projectFor(it) }
    var messageText by remember { mutableStateOf("") }
    val listState = rememberLazyListState()

    LaunchedEffect(conversationId) {
        repo.markAsRead(conversationId)
        repo.loadMessages(conversationId)
    }

    LaunchedEffect(conversation?.messages?.size, conversation?.status) {
        val size = conversation?.messages?.size ?: 0
        if (size > 0) listState.animateScrollToItem(size - 1 + if (conversation?.status == ConversationStatus.Thinking) 1 else 0)
    }

    val isThinking = conversation?.status == ConversationStatus.Thinking
    val isStreaming = conversation?.status == ConversationStatus.Streaming
    val isBusy = isThinking || isStreaming

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .statusBarsPadding()
            .imePadding(),
    ) {
        // Custom top bar
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            IconButton(onClick = onBack) {
                Icon(
                    Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = null,
                )
            }
            Column(modifier = Modifier.weight(1f)) {
                if (project != null) {
                    Text(
                        project.name,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Text(
                    agent?.name ?: "Agent",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }

        LazyColumn(
            modifier = Modifier.weight(1f),
            state = listState,
            contentPadding = PaddingValues(
                horizontal = 20.dp, vertical = 16.dp,
            ),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            conversation?.messages?.forEach { message ->
                item(key = message.id) { MessageRow(message = message) }
            }
            if (isThinking) {
                item(key = "thinking") { ThinkingIndicator() }
            }
        }

        ChatInputBar(
            text = messageText,
            onTextChange = { messageText = it },
            placeholder = if (isBusy)
                stringResourceOf(R.string.chat_waiting)
            else
                stringResourceOf(R.string.chat_message_placeholder),
            isDisabled = isBusy,
            autofocus = true,
            onSend = {
                val text = messageText.trim()
                if (text.isEmpty()) return@ChatInputBar
                messageText = ""
                repo.sendMessage(conversationId, text)
            },
            modifier = Modifier.navigationBarsPadding(),
        )
    }
}

@Composable
private fun MessageRow(message: Message) {
    val isUser = message.role == MessageRole.User
    if (isUser) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.End,
        ) {
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(18.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant)
                    .padding(horizontal = 14.dp, vertical = 10.dp),
            ) {
                Text(
                    text = message.text,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }
        }
    } else {
        Text(
            text = message.text,
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun stringResourceOf(id: Int): String =
    androidx.compose.ui.res.stringResource(id)
