package com.clawjs.chat.domain

import android.util.Log
import com.clawjs.chat.data.mock.MockData
import com.clawjs.chat.data.model.Agent
import com.clawjs.chat.data.model.Conversation
import com.clawjs.chat.data.model.ConversationStatus
import com.clawjs.chat.data.model.Message
import com.clawjs.chat.data.model.MessageRole
import com.clawjs.chat.data.model.Project
import com.clawjs.chat.data.model.Topic
import com.clawjs.chat.data.remote.ApiClient
import com.clawjs.chat.data.remote.SessionRecord
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.util.UUID

/**
 * 1:1 port of `apps/chat/ios/ClawJS/Services/ChatService.swift`.
 *
 * - Holds StateFlows of Agents, Projects, Topics, Conversations.
 * - Maintains UUID<->remoteId maps so the UI can stay UUID-only while talking
 *   to the Relay (which uses string IDs).
 * - Falls back to MockData when the Relay is unreachable on bootstrap.
 */
class ChatRepository(
    private val api: ApiClient,
    private val scope: CoroutineScope,
) {
    private val _agents = MutableStateFlow<List<Agent>>(MockData.agents)
    val agents: StateFlow<List<Agent>> = _agents.asStateFlow()

    private val _projects = MutableStateFlow<List<Project>>(MockData.projects)
    val projects: StateFlow<List<Project>> = _projects.asStateFlow()

    private val _topics = MutableStateFlow<List<Topic>>(emptyList())
    val topics: StateFlow<List<Topic>> = _topics.asStateFlow()

    private val _conversations = MutableStateFlow<List<Conversation>>(emptyList())
    val conversations: StateFlow<List<Conversation>> = _conversations.asStateFlow()

    private val _searchText = MutableStateFlow("")
    val searchText: StateFlow<String> = _searchText.asStateFlow()

    private val _isConnected = MutableStateFlow(false)
    val isConnected: StateFlow<Boolean> = _isConnected.asStateFlow()

    // --- id maps (guarded by mutex, same as iOS MainActor protection) --------
    private val mutex = Mutex()
    private val sessionMap = mutableMapOf<UUID, String>()
    private val agentMap = mutableMapOf<UUID, String>()
    private val projectMap = mutableMapOf<UUID, String>()
    private val reverseAgentMap = mutableMapOf<String, UUID>()
    private val reverseProjectMap = mutableMapOf<String, UUID>()
    private val projectAgents = mutableMapOf<UUID, List<UUID>>()
    private val agentProjects = mutableMapOf<UUID, List<UUID>>()

    // ---- Computed (filtered) views ------------------------------------------

    fun filteredProjects(): List<Project> {
        val q = _searchText.value
        return if (q.isEmpty()) _projects.value
        else _projects.value.filter { it.name.contains(q, ignoreCase = true) }
    }

    fun sortedConversations(): List<Conversation> {
        val q = _searchText.value
        val filtered = if (q.isEmpty()) _conversations.value
        else _conversations.value.filter { conv ->
            val agentName = agentFor(conv.agentId)?.name.orEmpty()
            val projectName = conv.projectId?.let { projectFor(it)?.name }.orEmpty()
            agentName.contains(q, ignoreCase = true)
                || projectName.contains(q, ignoreCase = true)
                || conv.title.contains(q, ignoreCase = true)
        }
        return filtered.sortedWith(
            compareBy<Conversation> { it.status.rank }
                .thenByDescending { it.lastActivityTime }
        )
    }

    fun agentFor(id: UUID): Agent? = _agents.value.firstOrNull { it.id == id }
    fun projectFor(id: UUID): Project? = _projects.value.firstOrNull { it.id == id }
    fun topicFor(id: UUID): Topic? = _topics.value.firstOrNull { it.id == id }

    fun agentsForProject(projectId: UUID): List<Agent> {
        val ids = projectAgents[projectId].orEmpty().toSet()
        return _agents.value.filter { it.id in ids }
    }

    fun defaultAgent(projectId: UUID): Agent? = agentsForProject(projectId).firstOrNull()

    fun defaultProject(agentId: UUID): Project? {
        val ids = agentProjects[agentId].orEmpty().toSet()
        return _projects.value.firstOrNull { it.id in ids }
    }

    fun defaultConversationContext(): Pair<Project, Agent>? {
        for (project in _projects.value) {
            val agent = defaultAgent(project.id) ?: continue
            return project to agent
        }
        return null
    }

    fun conversationsForAgent(agentId: UUID): List<Conversation> =
        sortedConversations().filter { it.agentId == agentId }

    fun conversationsForProject(projectId: UUID): List<Conversation> =
        sortedConversations().filter { it.projectId == projectId }

    fun topicsForProject(projectId: UUID): List<Topic> =
        _topics.value.filter { it.projectId == projectId }

    fun conversationsForTopic(topicId: UUID): List<Conversation> =
        sortedConversations().filter { it.topicId == topicId }

    fun thinkingCount(agentId: UUID): Int =
        _conversations.value.count { it.agentId == agentId && it.status == ConversationStatus.Thinking }

    fun unreadCount(agentId: UUID): Int =
        _conversations.value.count { it.agentId == agentId && it.status == ConversationStatus.Unread }

    // ---- Mutations ----------------------------------------------------------

    fun setSearchText(value: String) {
        _searchText.value = value
    }

    fun bootstrap() {
        scope.launch(Dispatchers.IO) {
            try {
                val payload = api.bootstrap()

                val nextProjects = mutableListOf<Project>()
                val nextAgents = mutableListOf<Agent>()
                val nextAgentProjects = mutableMapOf<UUID, List<UUID>>()
                val nextProjectAgents = mutableMapOf<UUID, MutableList<UUID>>()

                mutex.withLock {
                    for (rp in payload.projects) {
                        val localId = localProjectIdLocked(rp.id)
                        nextProjects += Project(
                            id = localId,
                            name = rp.name,
                            createdAt = rp.createdAt,
                        )
                    }

                    for (ra in payload.agents) {
                        val localId = localAgentIdLocked(ra.id)
                        val initials = ra.name.take(2).uppercase()
                        val icon = when {
                            ra.role.contains("devops", ignoreCase = true) -> "server.rack"
                            ra.role.contains("design", ignoreCase = true) -> "paintbrush"
                            ra.role.contains("code", ignoreCase = true) ||
                                ra.role.contains("developer", ignoreCase = true) -> "chevron.left.forwardslash.chevron.right"
                            else -> "brain.head.profile"
                        }
                        val projectIds = ra.projectIds.map { localProjectIdLocked(it) }
                        nextAgentProjects[localId] = projectIds
                        for (projectId in projectIds) {
                            nextProjectAgents.getOrPut(projectId) { mutableListOf() }.add(localId)
                        }
                        nextAgents += Agent(
                            id = localId,
                            name = ra.name,
                            initials = initials,
                            icon = icon,
                            role = ra.role,
                            description = ra.description,
                        )
                    }

                    val loadedSessionMap = mutableMapOf<UUID, String>()
                    val loadedConversations = mutableListOf<Conversation>()
                    for (rs in payload.sessions) {
                        val localProjectId = reverseProjectMap[rs.projectId] ?: continue
                        val localAgentId = reverseAgentMap[rs.agentId] ?: continue
                        val convId = UUID.randomUUID()
                        loadedSessionMap[convId] = rs.sessionId
                        loadedConversations += Conversation(
                            id = convId,
                            agentId = localAgentId,
                            projectId = localProjectId,
                            topicId = null,
                            title = rs.title,
                            messages = emptyList(),
                            status = ConversationStatus.Read,
                            createdAt = rs.createdAt,
                        )
                    }

                    projectAgents.clear()
                    projectAgents.putAll(nextProjectAgents.mapValues { it.value.toList() })
                    agentProjects.clear()
                    agentProjects.putAll(nextAgentProjects)
                    sessionMap.putAll(loadedSessionMap)

                    _projects.value = nextProjects.sortedBy { it.name.lowercase() }
                    _agents.value = nextAgents.sortedBy { it.name.lowercase() }
                    _topics.value = emptyList()
                    _conversations.value = loadedConversations
                    _isConnected.value = true
                }
            } catch (e: Exception) {
                Log.w(TAG, "API not available, using mock data: ${e.message}")
                _projects.value = MockData.projects
                _agents.value = MockData.agents
                _topics.value = MockData.topics
                _conversations.value = MockData.generateConversations()
                _isConnected.value = false
            }
        }
    }

    fun loadMessages(conversationId: UUID) {
        scope.launch(Dispatchers.IO) {
            val sessionId = mutex.withLock { sessionMap[conversationId] } ?: return@launch
            val conv = _conversations.value.firstOrNull { it.id == conversationId } ?: return@launch
            if (conv.messages.isNotEmpty()) return@launch
            val localProjectId = conv.projectId ?: return@launch
            val remoteProjectId = mutex.withLock { projectMap[localProjectId] } ?: return@launch
            val remoteAgentId = mutex.withLock { agentMap[conv.agentId] } ?: return@launch
            try {
                val session = api.getSession(sessionId, remoteAgentId, remoteProjectId)
                val messages = session.messages.map { sm ->
                    Message(
                        id = UUID.randomUUID(),
                        role = if (sm.role == "user") MessageRole.User else MessageRole.Agent,
                        text = sm.content,
                        timestamp = sm.createdAt,
                    )
                }
                updateConversation(conversationId) { it.copy(messages = messages) }
            } catch (e: Exception) {
                Log.w(TAG, "Failed to load messages: ${e.message}")
            }
        }
    }

    /**
     * Creates a local conversation and asynchronously the remote session.
     * Returns the new local conversation id, or null if there is no valid
     * project/agent context (no relay connection yet).
     */
    fun createConversation(
        agentId: UUID,
        projectId: UUID? = null,
        topicId: UUID? = null,
    ): UUID? {
        val resolvedProjectId = projectId
            ?: defaultProject(agentId)?.id
            ?: _projects.value.firstOrNull()?.id
            ?: return null
        val remoteProjectId = projectMap[resolvedProjectId] ?: return null
        val remoteAgentId = agentMap[agentId] ?: return null

        val localId = UUID.randomUUID()
        val agentName = agentFor(agentId)?.name ?: "Agent"
        val count = _conversations.value.count {
            it.agentId == agentId && it.projectId == resolvedProjectId
        } + 1
        val title = "$agentName Chat #$count"

        _conversations.value = _conversations.value + Conversation(
            id = localId,
            agentId = agentId,
            projectId = resolvedProjectId,
            topicId = topicId,
            title = title,
            messages = emptyList(),
            status = ConversationStatus.Read,
            createdAt = System.currentTimeMillis(),
        )

        scope.launch(Dispatchers.IO) {
            try {
                val session = api.createSession(title, remoteAgentId, remoteProjectId)
                mutex.withLock { sessionMap[localId] = session.sessionId }
            } catch (e: Exception) {
                Log.w(TAG, "Failed to create remote session: ${e.message}")
            }
        }

        return localId
    }

    fun sendMessage(conversationId: UUID, text: String) {
        val conv = _conversations.value.firstOrNull { it.id == conversationId } ?: return
        val userMessage = Message(
            id = UUID.randomUUID(),
            role = MessageRole.User,
            text = text,
            timestamp = System.currentTimeMillis(),
        )
        updateConversation(conversationId) {
            it.copy(
                messages = it.messages + userMessage,
                status = ConversationStatus.Thinking,
            )
        }

        val remoteAgentId = agentMap[conv.agentId]
        val remoteProjectId = conv.projectId?.let { projectMap[it] }
        val existingSessionId = sessionMap[conversationId]

        scope.launch(Dispatchers.IO) {
            try {
                val sessionId = existingSessionId ?: run {
                    if (remoteAgentId == null || remoteProjectId == null) {
                        fallbackReply(conversationId)
                        return@launch
                    }
                    val session = api.createSession(
                        title = conv.title,
                        agentId = remoteAgentId,
                        projectId = remoteProjectId,
                    )
                    mutex.withLock { sessionMap[conversationId] = session.sessionId }
                    session.sessionId
                }
                if (remoteAgentId == null || remoteProjectId == null) {
                    fallbackReply(conversationId)
                    return@launch
                }
                streamReply(conversationId, sessionId, remoteAgentId, remoteProjectId, text)
            } catch (e: Exception) {
                Log.w(TAG, "sendMessage failed: ${e.message}")
                fallbackReply(conversationId)
            }
        }
    }

    private suspend fun streamReply(
        conversationId: UUID,
        sessionId: String,
        agentId: String,
        projectId: String,
        text: String,
    ) {
        val accumulated = StringBuilder()
        try {
            api.sendMessage(text, sessionId, agentId, projectId)
                .collect { chunk -> accumulated.append(chunk) }
            val finalText = accumulated.toString()
            updateConversation(conversationId) {
                it.copy(
                    messages = it.messages + Message(
                        id = UUID.randomUUID(),
                        role = MessageRole.Agent,
                        text = finalText,
                        timestamp = System.currentTimeMillis(),
                    ),
                    status = ConversationStatus.Streaming,
                )
            }
        } catch (e: Exception) {
            Log.w(TAG, "Stream error: ${e.message}")
            val fallbackText = if (accumulated.isEmpty()) {
                "Connection error. Check that the relay is running on localhost:4410 and the assignment is online."
            } else accumulated.toString()
            updateConversation(conversationId) {
                it.copy(
                    messages = it.messages + Message(
                        id = UUID.randomUUID(),
                        role = MessageRole.Agent,
                        text = fallbackText,
                        timestamp = System.currentTimeMillis(),
                    ),
                    status = ConversationStatus.Unread,
                )
            }
        }
    }

    fun finishStreaming(conversationId: UUID) {
        updateConversation(conversationId) {
            if (it.status == ConversationStatus.Streaming) {
                it.copy(status = ConversationStatus.Unread)
            } else it
        }
    }

    fun markAsRead(conversationId: UUID) {
        updateConversation(conversationId) {
            if (it.status == ConversationStatus.Unread) {
                it.copy(status = ConversationStatus.Read)
            } else it
        }
    }

    fun changeAgent(conversationId: UUID, agentId: UUID) {
        val conv = _conversations.value.firstOrNull { it.id == conversationId } ?: return
        if (conv.messages.isNotEmpty()) return
        if (sessionMap[conversationId] != null) return
        val projectId = conv.projectId ?: return
        if (agentId !in projectAgents[projectId].orEmpty()) return
        updateConversation(conversationId) { it.copy(agentId = agentId) }
    }

    fun deleteConversation(conversationId: UUID) {
        scope.launch { mutex.withLock { sessionMap.remove(conversationId) } }
        _conversations.value = _conversations.value.filterNot { it.id == conversationId }
    }

    fun deleteAllConversations() {
        scope.launch { mutex.withLock { sessionMap.clear() } }
        _conversations.value = emptyList()
    }

    // ---- helpers ------------------------------------------------------------

    private fun fallbackReply(conversationId: UUID) {
        val replies = listOf(
            "Could not connect to the relay. Make sure it is running on localhost:4410.",
            "Connection failed. Ensure the relay has a live project-agent assignment before opening the app.",
        )
        updateConversation(conversationId) {
            it.copy(
                messages = it.messages + Message(
                    id = UUID.randomUUID(),
                    role = MessageRole.Agent,
                    text = replies.random(),
                    timestamp = System.currentTimeMillis(),
                ),
                status = ConversationStatus.Unread,
            )
        }
    }

    private fun updateConversation(
        id: UUID,
        transform: (Conversation) -> Conversation,
    ) {
        _conversations.value = _conversations.value.map {
            if (it.id == id) transform(it) else it
        }
    }

    private fun localAgentIdLocked(remoteId: String): UUID =
        reverseAgentMap[remoteId] ?: UUID.randomUUID().also {
            reverseAgentMap[remoteId] = it
            agentMap[it] = remoteId
        }

    private fun localProjectIdLocked(remoteId: String): UUID =
        reverseProjectMap[remoteId] ?: UUID.randomUUID().also {
            reverseProjectMap[remoteId] = it
            projectMap[it] = remoteId
        }

    companion object {
        private const val TAG = "ChatRepository"
    }
}

// Unused import silencer when API surface is not touched.
@Suppress("unused")
private fun keepTypes(r: SessionRecord?): SessionRecord? = r
