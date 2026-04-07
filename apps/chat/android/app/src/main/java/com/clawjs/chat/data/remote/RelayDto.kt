package com.clawjs.chat.data.remote

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// Wire-level DTOs mirroring the private RelayConfig/Relay* structs in
// apps/chat/ios/ClawJS/Services/APIService.swift.

@Serializable
data class RelayAuthRequest(
    val email: String,
    val password: String,
    val tenantId: String,
)

@Serializable
data class RelayAuthResponse(
    val accessToken: String,
)

@Serializable
data class RelayProjectsResponse(
    val projects: List<RelayProject> = emptyList(),
)

@Serializable
data class RelayProject(
    val projectId: String,
    val displayName: String,
    val description: String? = null,
    val createdAt: Long,
    val updatedAt: Long,
)

@Serializable
data class RelayProjectAgentsResponse(
    val agents: List<RelayProjectAgent> = emptyList(),
)

@Serializable
data class RelayProjectAgent(
    val agentId: String,
    val displayName: String? = null,
    val agent: RelayAgentDetails? = null,
)

@Serializable
data class RelayAgentDetails(
    val agentId: String,
    val displayName: String? = null,
    val role: String? = null,
    val description: String? = null,
)

@Serializable
data class RelaySessionsResponse(
    val sessions: List<RelaySessionSummary> = emptyList(),
)

@Serializable
data class RelaySessionSummary(
    val sessionId: String,
    val title: String,
    val createdAt: Long,
    val updatedAt: Long,
    val messageCount: Int = 0,
    val preview: String = "",
)

@Serializable
data class RelaySessionRecordResponse(
    val session: RelaySessionRecord,
)

@Serializable
data class RelaySessionRecord(
    val sessionId: String,
    val title: String,
    val createdAt: Long,
    val updatedAt: Long,
    val messageCount: Int = 0,
    val preview: String = "",
    val messages: List<RelaySessionMessage> = emptyList(),
)

@Serializable
data class RelaySessionMessage(
    val id: String,
    val role: String,
    val content: String,
    val createdAt: Long,
)

@Serializable
data class RelayCreateSessionRequest(
    val title: String,
)

@Serializable
data class RelayStreamChunk(
    val delta: String? = null,
)

@Serializable
data class RelayStreamError(
    val error: String? = null,
)

@Serializable
data class RelayHealth(
    val service: String = "",
    val status: String = "",
)

// ---- Flattened payloads used by ChatRepository ------------------------------

data class RemoteAgent(
    val id: String,
    val name: String,
    val role: String,
    val description: String,
    val projectIds: List<String>,
)

data class RemoteProject(
    val id: String,
    val name: String,
    val description: String,
    val agentIds: List<String>,
    val createdAt: Long,
    val updatedAt: Long,
)

data class SessionSummary(
    val sessionId: String,
    val title: String,
    val agentId: String,
    val projectId: String,
    val createdAt: Long,
    val updatedAt: Long,
    val messageCount: Int,
    val preview: String,
)

data class BootstrapPayload(
    val agents: List<RemoteAgent>,
    val projects: List<RemoteProject>,
    val sessions: List<SessionSummary>,
)

data class SessionRecord(
    val sessionId: String,
    val title: String,
    val agentId: String,
    val projectId: String,
    val createdAt: Long,
    val updatedAt: Long,
    val messageCount: Int,
    val preview: String,
    val messages: List<SessionMessage>,
)

data class SessionMessage(
    val id: String,
    val role: String,
    val content: String,
    val createdAt: Long,
)

class RelayApiException(message: String, val statusCode: Int? = null) : Exception(message)
