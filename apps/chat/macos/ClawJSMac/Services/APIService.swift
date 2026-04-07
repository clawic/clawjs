import Foundation

final class APIService {
    static let shared = APIService()

    private init() {}

    struct RemoteAgent: Codable {
        let id: String
        let name: String
        let role: String
        let description: String
        let projectIds: [String]
    }

    struct RemoteProject: Codable {
        let id: String
        let name: String
        let description: String
        let agentIds: [String]
        let createdAt: Int
        let updatedAt: Int
    }

    struct SessionSummary: Codable {
        let sessionId: String
        let title: String
        let agentId: String
        let projectId: String
        let createdAt: Int
        let updatedAt: Int
        let messageCount: Int
        let preview: String
    }

    struct SessionRecord: Codable {
        let sessionId: String
        let title: String
        let agentId: String
        let projectId: String
        let createdAt: Int
        let updatedAt: Int
        let messageCount: Int
        let preview: String
        let messages: [SessionMessage]
    }

    struct SessionMessage: Codable {
        let id: String
        let role: String
        let content: String
        let createdAt: Int
    }

    struct BootstrapPayload {
        let agents: [RemoteAgent]
        let projects: [RemoteProject]
        let sessions: [SessionSummary]
    }

    struct HealthResponse: Codable {
        let status: String
        let relayUrl: String
        let tenantId: String
    }

    func bootstrap() async throws -> BootstrapPayload {
        let config = relayConfig()
        let token = try await accessToken(for: config)

        let projectResponse: RelayProjectsResponse = try await requestJSON(
            path: tenantPath(config.tenantId, suffix: "/projects"),
            token: token,
            config: config
        )

        var projects: [RemoteProject] = []
        var agentById: [String: RemoteAgent] = [:]
        var projectIdsByAgent: [String: Set<String>] = [:]
        var sessions: [SessionSummary] = []

        for project in projectResponse.projects {
            let projectId = project.projectId
            let projectAgentsResponse: RelayProjectAgentsResponse = try await requestJSON(
                path: tenantPath(config.tenantId, suffix: "/projects/\(encode(projectId))/agents"),
                token: token,
                config: config
            )

            let agentIds: [String] = projectAgentsResponse.agents.compactMap { assignment in
                let agentId = assignment.agentId
                guard !agentId.isEmpty else { return nil }

                let agentInfo = assignment.agent
                let currentProjects = projectIdsByAgent[agentId] ?? Set<String>()
                projectIdsByAgent[agentId] = currentProjects.union([projectId])
                agentById[agentId] = RemoteAgent(
                    id: agentId,
                    name: agentInfo?.displayName ?? assignment.displayName ?? agentId,
                    role: agentInfo?.role ?? "assistant",
                    description: agentInfo?.description ?? "",
                    projectIds: []
                )
                return agentId
            }

            projects.append(RemoteProject(
                id: projectId,
                name: project.displayName,
                description: project.description ?? "",
                agentIds: agentIds,
                createdAt: project.createdAt,
                updatedAt: project.updatedAt
            ))

            for agentId in agentIds {
                let projectSessionsResponse: RelaySessionsResponse = try await requestJSON(
                    path: tenantPath(
                        config.tenantId,
                        suffix: "/projects/\(encode(projectId))/agents/\(encode(agentId))/sessions"
                    ),
                    token: token,
                    config: config
                )

                sessions.append(contentsOf: projectSessionsResponse.sessions.map { session in
                    SessionSummary(
                        sessionId: session.sessionId,
                        title: session.title,
                        agentId: agentId,
                        projectId: projectId,
                        createdAt: session.createdAt,
                        updatedAt: session.updatedAt,
                        messageCount: session.messageCount,
                        preview: session.preview
                    )
                })
            }
        }

        let agents = agentById.values
            .map { agent in
                RemoteAgent(
                    id: agent.id,
                    name: agent.name,
                    role: agent.role,
                    description: agent.description,
                    projectIds: Array(projectIdsByAgent[agent.id] ?? []).sorted()
                )
            }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }

        let sortedProjects = projects.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
        let sortedSessions = sessions.sorted { left, right in
            if left.updatedAt == right.updatedAt {
                return left.createdAt > right.createdAt
            }
            return left.updatedAt > right.updatedAt
        }

        return BootstrapPayload(
            agents: agents,
            projects: sortedProjects,
            sessions: sortedSessions
        )
    }

    func createSession(title: String, agentId: String, projectId: String) async throws -> SessionRecord {
        let config = relayConfig()
        let token = try await accessToken(for: config)
        let response: RelaySessionRecordResponse = try await requestJSON(
            path: tenantPath(
                config.tenantId,
                suffix: "/projects/\(encode(projectId))/agents/\(encode(agentId))/sessions"
            ),
            method: "POST",
            token: token,
            body: [
                "title": title,
            ],
            config: config
        )
        return toSessionRecord(response.session, agentId: agentId, projectId: projectId)
    }

    func getSession(id: String, agentId: String, projectId: String) async throws -> SessionRecord {
        let config = relayConfig()
        let token = try await accessToken(for: config)
        let response: RelaySessionRecordResponse = try await requestJSON(
            path: tenantPath(
                config.tenantId,
                suffix: "/projects/\(encode(projectId))/agents/\(encode(agentId))/sessions/\(encode(id))"
            ),
            token: token,
            config: config
        )
        return toSessionRecord(response.session, agentId: agentId, projectId: projectId)
    }

    func sendMessage(text: String, sessionId: String, agentId: String, projectId: String) -> AsyncThrowingStream<String, Error> {
        AsyncThrowingStream { continuation in
            Task {
                do {
                    let config = relayConfig()
                    let token = try await accessToken(for: config)
                    var components = URLComponents(url: try makeURL(
                        tenantPath(
                            config.tenantId,
                            suffix: "/projects/\(encode(projectId))/agents/\(encode(agentId))/sessions/\(encode(sessionId))/stream"
                        ),
                        config: config
                    ), resolvingAgainstBaseURL: false)
                    components?.queryItems = [
                        URLQueryItem(name: "message", value: text),
                    ]
                    guard let url = components?.url else {
                        throw APIError.invalidURL
                    }

                    var request = URLRequest(url: url)
                    request.httpMethod = "GET"
                    request.timeoutInterval = 180
                    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

                    let session = URLSession(configuration: .default)
                    let (bytes, response) = try await session.bytes(for: request)
                    guard let httpResponse = response as? HTTPURLResponse else {
                        throw APIError.badResponse
                    }
                    guard httpResponse.statusCode == 200 else {
                        throw APIError.http(httpResponse.statusCode)
                    }

                    var currentEvent: String?
                    for try await line in bytes.lines {
                        if line.isEmpty {
                            currentEvent = nil
                            continue
                        }
                        if line.hasPrefix("event: ") {
                            currentEvent = String(line.dropFirst(7))
                            continue
                        }
                        guard line.hasPrefix("data: ") else { continue }
                        let json = String(line.dropFirst(6))
                        guard let data = json.data(using: .utf8) else { continue }

                        switch currentEvent {
                        case "chunk":
                            if let payload = try? JSONDecoder().decode(RelayStreamChunk.self, from: data),
                               let delta = payload.delta,
                               !delta.isEmpty {
                                continuation.yield(delta)
                            }
                        case "error":
                            let payload = try? JSONDecoder().decode(RelayStreamError.self, from: data)
                            throw APIError.server(payload?.error ?? "Relay stream failed")
                        default:
                            continue
                        }
                    }

                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
        }
    }

    func health() async throws -> HealthResponse {
        let config = relayConfig()
        let token = try await accessToken(for: config)
        struct RelayHealth: Codable {
            let service: String
            let status: String
        }

        let response: RelayHealth = try await requestJSON(path: "/v1/health", token: token, config: config)
        return HealthResponse(
            status: response.status,
            relayUrl: config.baseURL,
            tenantId: config.tenantId
        )
    }

    private func toSessionRecord(_ session: RelaySessionRecord, agentId: String, projectId: String) -> SessionRecord {
        SessionRecord(
            sessionId: session.sessionId,
            title: session.title,
            agentId: agentId,
            projectId: projectId,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
            messageCount: session.messageCount,
            preview: session.preview,
            messages: session.messages.map {
                SessionMessage(
                    id: $0.id,
                    role: $0.role,
                    content: $0.content,
                    createdAt: $0.createdAt
                )
            }
        )
    }

    private func accessToken(for config: RelayConfig) async throws -> String {
        var request = URLRequest(url: try makeURL("/v1/auth/login", config: config))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "email": config.email,
            "password": config.password,
            "tenantId": config.tenantId,
        ])

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.badResponse
        }
        guard httpResponse.statusCode == 200 else {
            throw APIError.http(httpResponse.statusCode)
        }
        let auth = try JSONDecoder().decode(RelayAuthResponse.self, from: data)
        return auth.accessToken
    }

    private func requestJSON<Response: Decodable>(
        path: String,
        method: String = "GET",
        token: String,
        body: [String: Any]? = nil,
        config: RelayConfig
    ) async throws -> Response {
        var request = URLRequest(url: try makeURL(path, config: config))
        request.httpMethod = method
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.badResponse
        }
        guard 200..<300 ~= httpResponse.statusCode else {
            throw APIError.http(httpResponse.statusCode)
        }
        return try JSONDecoder().decode(Response.self, from: data)
    }

    private func makeURL(_ path: String, config: RelayConfig) throws -> URL {
        guard let url = URL(string: path, relativeTo: URL(string: config.baseURL))?.absoluteURL else {
            throw APIError.invalidURL
        }
        return url
    }

    private func tenantPath(_ tenantId: String, suffix: String) -> String {
        "/v1/tenants/\(encode(tenantId))\(suffix)"
    }

    private func encode(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? value
    }

    private func relayConfig() -> RelayConfig {
        let defaults = UserDefaults.standard
        return RelayConfig(
            baseURL: defaults.string(forKey: "relayBaseURL") ?? "http://127.0.0.1:4410",
            tenantId: defaults.string(forKey: "relayTenantId") ?? "demo-tenant",
            email: defaults.string(forKey: "relayEmail") ?? "user@relay.local",
            password: defaults.string(forKey: "relayPassword") ?? "relay-user"
        )
    }
}

private struct RelayConfig {
    let baseURL: String
    let tenantId: String
    let email: String
    let password: String
}

private struct RelayAuthResponse: Codable {
    let accessToken: String
}

private struct RelayProjectsResponse: Codable {
    let projects: [RelayProject]
}

private struct RelayProject: Codable {
    let projectId: String
    let displayName: String
    let description: String?
    let createdAt: Int
    let updatedAt: Int
}

private struct RelayProjectAgentsResponse: Codable {
    let agents: [RelayProjectAgent]
}

private struct RelayProjectAgent: Codable {
    let agentId: String
    let displayName: String?
    let agent: RelayAgentDetails?
}

private struct RelayAgentDetails: Codable {
    let agentId: String
    let displayName: String?
    let role: String?
    let description: String?
}

private struct RelaySessionsResponse: Codable {
    let sessions: [RelaySessionSummary]
}

private struct RelaySessionSummary: Codable {
    let sessionId: String
    let title: String
    let createdAt: Int
    let updatedAt: Int
    let messageCount: Int
    let preview: String
}

private struct RelaySessionRecordResponse: Codable {
    let session: RelaySessionRecord
}

private struct RelaySessionRecord: Codable {
    let sessionId: String
    let title: String
    let createdAt: Int
    let updatedAt: Int
    let messageCount: Int
    let preview: String
    let messages: [RelaySessionMessage]
}

private struct RelaySessionMessage: Codable {
    let id: String
    let role: String
    let content: String
    let createdAt: Int
}

private struct RelayStreamChunk: Codable {
    let delta: String?
}

private struct RelayStreamError: Codable {
    let error: String?
}

extension APIService {
    enum APIError: Error, LocalizedError {
        case badResponse
        case invalidURL
        case http(Int)
        case server(String)

        var errorDescription: String? {
            switch self {
            case .badResponse:
                return "Bad response from relay"
            case .invalidURL:
                return "Invalid relay URL"
            case .http(let statusCode):
                return "Relay request failed with status \(statusCode)"
            case .server(let message):
                return message
            }
        }
    }
}
