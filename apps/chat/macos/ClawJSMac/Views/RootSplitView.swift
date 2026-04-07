import SwiftUI

// MARK: - Navigation Target (shared across detail views)

enum NavigationTarget: Hashable {
    case conversation(UUID)
    case agentDetail(UUID)
    case createAgent
    case project(UUID)
    case allProjects
    case topic(UUID)
    case settings
}

struct RootSplitView: View {
    @EnvironmentObject private var chatService: ChatService
    @State private var rootSelection: SidebarItem?
    @State private var navigationPath = NavigationPath()
    @State private var columnVisibility: NavigationSplitViewVisibility = .all

    var body: some View {
        NavigationSplitView(columnVisibility: $columnVisibility) {
            SidebarView(selection: $rootSelection, onNewChat: startNewChat)
                .navigationSplitViewColumnWidth(min: 240, ideal: 280, max: 360)
        } detail: {
            NavigationStack(path: $navigationPath) {
                rootContent
                    .navigationDestination(for: NavigationTarget.self) { target in
                        destination(for: target)
                    }
            }
            .navigationSplitViewColumnWidth(min: 520, ideal: 780)
        }
        .navigationSplitViewStyle(.balanced)
        .onChange(of: rootSelection) { _, _ in
            navigationPath = NavigationPath()
        }
        .onReceive(NotificationCenter.default.publisher(for: .clawNewChatRequested)) { _ in
            startNewChat()
        }
    }

    // MARK: - Root content (detail column root)

    @ViewBuilder
    private var rootContent: some View {
        switch rootSelection {
        case .none:
            HomeOverview(navigationPath: $navigationPath)
        case .project(let id):
            if let project = chatService.project(for: id) {
                ProjectDetailView(project: project, navigationPath: $navigationPath)
            } else {
                EmptyStateView(title: L10n.Home.projects)
            }
        case .agent(let id):
            if let agent = chatService.agent(for: id) {
                AgentDetailView(agent: agent, navigationPath: $navigationPath)
            } else {
                EmptyStateView(title: L10n.Agent.newAgent)
            }
        case .conversation(let id):
            if let conv = chatService.conversations.first(where: { $0.id == id }) {
                ChatView(conversation: conv, navigationPath: $navigationPath)
            } else {
                EmptyStateView(title: L10n.Home.conversations)
            }
        }
    }

    @ViewBuilder
    private func destination(for target: NavigationTarget) -> some View {
        switch target {
        case .conversation(let id):
            if let conv = chatService.conversations.first(where: { $0.id == id }) {
                ChatView(conversation: conv, navigationPath: $navigationPath)
            }
        case .agentDetail(let id):
            if let agent = chatService.agent(for: id) {
                AgentDetailView(agent: agent, navigationPath: $navigationPath)
            }
        case .createAgent:
            CreateAgentView(navigationPath: $navigationPath)
        case .project(let id):
            if let project = chatService.project(for: id) {
                ProjectDetailView(project: project, navigationPath: $navigationPath)
            }
        case .allProjects:
            Text(L10n.Home.allProjects)
        case .topic(let id):
            if let topic = chatService.topic(for: id) {
                TopicDetailView(topic: topic, navigationPath: $navigationPath)
            }
        case .settings:
            SettingsView()
        }
    }

    // MARK: - Actions

    private func startNewChat() {
        let context = chatService.defaultConversationContext()
        let agent = context?.agent ?? chatService.agents.first
        let project = context?.project ?? chatService.projects.first
        guard let agent, let project,
              let convId = chatService.createConversation(
                agentId: agent.id,
                projectId: project.id
              )
        else { return }
        rootSelection = .conversation(convId)
        navigationPath = NavigationPath()
    }
}

// MARK: - Sidebar selection model

enum SidebarItem: Hashable {
    case project(UUID)
    case agent(UUID)
    case conversation(UUID)
}

// MARK: - Home overview (shown when sidebar is on Home)

private struct HomeOverview: View {
    @EnvironmentObject private var chatService: ChatService
    @Binding var navigationPath: NavigationPath

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                Text(L10n.General.appName)
                    .font(.system(size: 34, weight: .bold))
                    .padding(.horizontal, 24)
                    .padding(.top, 24)

                AgentStripView(
                    onAgentTap: { id in
                        navigationPath.append(NavigationTarget.agentDetail(id))
                    },
                    onCreateTap: {
                        navigationPath.append(NavigationTarget.createAgent)
                    }
                )

                VStack(alignment: .leading, spacing: 12) {
                    Text(L10n.Home.projects)
                        .font(.system(size: 20, weight: .semibold))
                        .padding(.horizontal, 24)

                    LazyVGrid(
                        columns: [GridItem(.adaptive(minimum: 220), spacing: 12)],
                        spacing: 12
                    ) {
                        ForEach(chatService.projects) { project in
                            Button {
                                navigationPath.append(NavigationTarget.project(project.id))
                            } label: {
                                projectCard(project)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 24)
                }

                VStack(alignment: .leading, spacing: 12) {
                    Text(L10n.Home.conversations)
                        .font(.system(size: 20, weight: .semibold))
                        .padding(.horizontal, 24)

                    VStack(spacing: 0) {
                        ForEach(chatService.sortedConversations) { conv in
                            Button {
                                navigationPath.append(NavigationTarget.conversation(conv.id))
                            } label: {
                                HStack(spacing: 10) {
                                    Text(conv.title)
                                        .font(.system(size: 15))
                                        .foregroundColor(.primary)
                                        .lineLimit(1)
                                    Spacer()
                                    if conv.status != .read {
                                        Circle()
                                            .fill(Color.blue)
                                            .frame(width: 8, height: 8)
                                    }
                                }
                                .padding(.horizontal, 24)
                                .padding(.vertical, 12)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            Divider().padding(.leading, 24)
                        }
                    }
                }
                .padding(.bottom, 40)
            }
        }
        .background(Color(.systemBackground))
    }

    private func projectCard(_ project: Project) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "folder.fill")
                .font(.system(size: 18))
                .foregroundColor(.accentColor)
            Text(project.name)
                .font(.system(size: 15, weight: .medium))
                .foregroundColor(.primary)
                .lineLimit(1)
            Spacer()
        }
        .padding(14)
        .background(Color(.systemGray6))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

private struct EmptyStateView: View {
    let title: String
    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "bubble.left")
                .font(.system(size: 40))
                .foregroundColor(.secondary)
            Text(title)
                .font(.title3)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemBackground))
    }
}
