package com.clawjs.chat.data.remote

import com.clawjs.chat.data.settings.SettingsStore
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.Json
import okhttp3.Call
import okhttp3.Callback
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.sse.EventSource
import okhttp3.sse.EventSourceListener
import okhttp3.sse.EventSources
import java.io.IOException
import java.net.URLEncoder
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import okhttp3.Response as OkResponse

/**
 * 1:1 port of `apps/chat/ios/ClawJS/Services/APIService.swift`.
 *
 * Talks to the OpenClaw Relay directly. Token is acquired lazily via
 * `POST /v1/auth/login` and cached in memory. On 401 or first call the token
 * is (re-)minted.
 */
class ApiClient(
    private val settingsStore: SettingsStore,
    private val httpClient: OkHttpClient = defaultClient(),
) {
    private val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
    }
    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()

    @Volatile
    private var cachedToken: String? = null

    // ---- Public API ---------------------------------------------------------

    suspend fun bootstrap(): BootstrapPayload {
        val config = settingsStore.currentConfig()
        val token = accessToken(config)

        val projectsResponse: RelayProjectsResponse = getJson(
            config, token,
            tenantPath(config.tenantId, "/projects"),
            RelayProjectsResponse.serializer(),
        )

        val projects = mutableListOf<RemoteProject>()
        val agentById = mutableMapOf<String, RemoteAgent>()
        val projectIdsByAgent = mutableMapOf<String, MutableSet<String>>()
        val sessions = mutableListOf<SessionSummary>()

        for (project in projectsResponse.projects) {
            val projectId = project.projectId
            val projectAgentsResponse: RelayProjectAgentsResponse = getJson(
                config, token,
                tenantPath(config.tenantId, "/projects/${encode(projectId)}/agents"),
                RelayProjectAgentsResponse.serializer(),
            )

            val agentIds = projectAgentsResponse.agents.mapNotNull { assignment ->
                val agentId = assignment.agentId
                if (agentId.isEmpty()) return@mapNotNull null
                val details = assignment.agent
                projectIdsByAgent.getOrPut(agentId) { mutableSetOf() }.add(projectId)
                agentById[agentId] = RemoteAgent(
                    id = agentId,
                    name = details?.displayName ?: assignment.displayName ?: agentId,
                    role = details?.role ?: "assistant",
                    description = details?.description ?: "",
                    projectIds = emptyList(),
                )
                agentId
            }

            projects.add(
                RemoteProject(
                    id = projectId,
                    name = project.displayName,
                    description = project.description ?: "",
                    agentIds = agentIds,
                    createdAt = project.createdAt,
                    updatedAt = project.updatedAt,
                )
            )

            for (agentId in agentIds) {
                val sessionsResponse: RelaySessionsResponse = getJson(
                    config, token,
                    tenantPath(
                        config.tenantId,
                        "/projects/${encode(projectId)}/agents/${encode(agentId)}/sessions",
                    ),
                    RelaySessionsResponse.serializer(),
                )
                sessionsResponse.sessions.forEach { session ->
                    sessions.add(
                        SessionSummary(
                            sessionId = session.sessionId,
                            title = session.title,
                            agentId = agentId,
                            projectId = projectId,
                            createdAt = session.createdAt,
                            updatedAt = session.updatedAt,
                            messageCount = session.messageCount,
                            preview = session.preview,
                        )
                    )
                }
            }
        }

        val agents = agentById.values
            .map { agent ->
                agent.copy(
                    projectIds = projectIdsByAgent[agent.id]?.toList()?.sorted().orEmpty(),
                )
            }
            .sortedBy { it.name.lowercase() }

        val sortedProjects = projects.sortedBy { it.name.lowercase() }
        val sortedSessions = sessions.sortedWith(
            compareByDescending<SessionSummary> { it.updatedAt }
                .thenByDescending { it.createdAt }
        )

        return BootstrapPayload(agents, sortedProjects, sortedSessions)
    }

    suspend fun createSession(
        title: String,
        agentId: String,
        projectId: String,
    ): SessionRecord {
        val config = settingsStore.currentConfig()
        val token = accessToken(config)
        val response: RelaySessionRecordResponse = postJson(
            config, token,
            tenantPath(
                config.tenantId,
                "/projects/${encode(projectId)}/agents/${encode(agentId)}/sessions",
            ),
            body = RelayCreateSessionRequest(title = title),
            bodySerializer = RelayCreateSessionRequest.serializer(),
            responseSerializer = RelaySessionRecordResponse.serializer(),
        )
        return response.session.toRecord(agentId, projectId)
    }

    suspend fun getSession(
        sessionId: String,
        agentId: String,
        projectId: String,
    ): SessionRecord {
        val config = settingsStore.currentConfig()
        val token = accessToken(config)
        val response: RelaySessionRecordResponse = getJson(
            config, token,
            tenantPath(
                config.tenantId,
                "/projects/${encode(projectId)}/agents/${encode(agentId)}/sessions/${encode(sessionId)}",
            ),
            RelaySessionRecordResponse.serializer(),
        )
        return response.session.toRecord(agentId, projectId)
    }

    /** Opens an SSE stream and emits non-empty `delta` strings per `chunk` event. */
    fun sendMessage(
        text: String,
        sessionId: String,
        agentId: String,
        projectId: String,
    ): Flow<String> = callbackFlow {
        val config = settingsStore.currentConfig()
        val token = accessToken(config)
        val url = (config.baseUrl.trimEnd('/') + tenantPath(
            config.tenantId,
            "/projects/${encode(projectId)}/agents/${encode(agentId)}/sessions/${encode(sessionId)}/stream",
        ))
            .toHttpUrl()
            .newBuilder()
            .addQueryParameter("message", text)
            .build()

        val request = Request.Builder()
            .url(url)
            .get()
            .addHeader("Authorization", "Bearer $token")
            .addHeader("Accept", "text/event-stream")
            .build()

        val factory = EventSources.createFactory(httpClient)
        val source = factory.newEventSource(
            request,
            object : EventSourceListener() {
                override fun onEvent(
                    eventSource: EventSource,
                    id: String?,
                    type: String?,
                    data: String,
                ) {
                    when (type) {
                        "chunk" -> {
                            val delta = runCatching {
                                json.decodeFromString(RelayStreamChunk.serializer(), data).delta
                            }.getOrNull()
                            if (!delta.isNullOrEmpty()) {
                                trySend(delta)
                            }
                        }

                        "error" -> {
                            val payload = runCatching {
                                json.decodeFromString(RelayStreamError.serializer(), data)
                            }.getOrNull()
                            close(RelayApiException(payload?.error ?: "Relay stream failed"))
                        }

                        else -> Unit
                    }
                }

                override fun onClosed(eventSource: EventSource) {
                    close()
                }

                override fun onFailure(
                    eventSource: EventSource,
                    t: Throwable?,
                    response: OkResponse?,
                ) {
                    val statusCode = response?.code
                    val message = t?.message
                        ?: "Relay stream failed (${statusCode ?: "no response"})"
                    close(RelayApiException(message, statusCode))
                }
            }
        )

        awaitClose { source.cancel() }
    }

    suspend fun health(): Pair<String, RelayConfig> {
        val config = settingsStore.currentConfig()
        val token = accessToken(config)
        val response: RelayHealth = getJson(
            config, token, "/v1/health", RelayHealth.serializer(),
        )
        return response.status to config
    }

    // ---- Internals ----------------------------------------------------------

    private suspend fun accessToken(config: RelayConfig): String {
        cachedToken?.let { return it }
        val request = Request.Builder()
            .url(config.baseUrl.trimEnd('/') + "/v1/auth/login")
            .post(
                json.encodeToString(
                    RelayAuthRequest.serializer(),
                    RelayAuthRequest(
                        email = config.email,
                        password = config.password,
                        tenantId = config.tenantId,
                    ),
                ).toRequestBody(jsonMediaType)
            )
            .addHeader("Content-Type", "application/json")
            .build()
        val body = executeRaw(request)
        val response = json.decodeFromString(RelayAuthResponse.serializer(), body)
        return response.accessToken.also { cachedToken = it }
    }

    /** Public hook used when the caller wants to force a re-login (e.g. after 401). */
    fun clearToken() {
        cachedToken = null
    }

    private suspend fun <T> getJson(
        config: RelayConfig,
        token: String,
        path: String,
        responseSerializer: KSerializer<T>,
    ): T {
        val request = Request.Builder()
            .url(config.baseUrl.trimEnd('/') + path)
            .get()
            .addHeader("Authorization", "Bearer $token")
            .build()
        return json.decodeFromString(responseSerializer, executeRaw(request))
    }

    private suspend fun <Req, Res> postJson(
        config: RelayConfig,
        token: String,
        path: String,
        body: Req,
        bodySerializer: KSerializer<Req>,
        responseSerializer: KSerializer<Res>,
    ): Res {
        val request = Request.Builder()
            .url(config.baseUrl.trimEnd('/') + path)
            .post(
                json.encodeToString(bodySerializer, body).toRequestBody(jsonMediaType)
            )
            .addHeader("Authorization", "Bearer $token")
            .addHeader("Content-Type", "application/json")
            .build()
        return json.decodeFromString(responseSerializer, executeRaw(request))
    }

    private suspend fun executeRaw(request: Request): String =
        suspendCancellableCoroutine { cont ->
            val call = httpClient.newCall(request)
            cont.invokeOnCancellation { runCatching { call.cancel() } }
            call.enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) {
                    cont.resumeWithException(e)
                }

                override fun onResponse(call: Call, response: OkResponse) {
                    response.use {
                        if (!it.isSuccessful) {
                            if (it.code == 401) cachedToken = null
                            cont.resumeWithException(
                                RelayApiException(
                                    "Relay request failed with status ${it.code}",
                                    it.code,
                                )
                            )
                            return
                        }
                        cont.resume(it.body?.string().orEmpty())
                    }
                }
            })
        }

    private fun tenantPath(tenantId: String, suffix: String): String =
        "/v1/tenants/${encode(tenantId)}$suffix"

    private fun encode(value: String): String =
        URLEncoder.encode(value, Charsets.UTF_8).replace("+", "%20")

    private fun RelaySessionRecord.toRecord(agentId: String, projectId: String) = SessionRecord(
        sessionId = sessionId,
        title = title,
        agentId = agentId,
        projectId = projectId,
        createdAt = createdAt,
        updatedAt = updatedAt,
        messageCount = messageCount,
        preview = preview,
        messages = messages.map {
            SessionMessage(it.id, it.role, it.content, it.createdAt)
        },
    )

    companion object {
        private fun defaultClient(): OkHttpClient = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(180, TimeUnit.SECONDS) // matches iOS timeoutInterval = 180
            .writeTimeout(30, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .build()
    }
}
