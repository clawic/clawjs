import SwiftUI

// MARK: - Navigation Target

enum NavigationTarget: Hashable {
    case conversation(UUID)
    case agentDetail(UUID)
    case createAgent
    case project(UUID)
    case allProjects
    case topic(UUID)
    case settings
}

// MARK: - Conversation List View

struct ConversationListView: View {
    @EnvironmentObject private var chatService: ChatService
    @State private var navigationPath = NavigationPath()
    @State private var showSearch = false
    @State private var showAllProjects = false
    @FocusState private var searchFocused: Bool
    private let visibleProjectCount = 5

    private var isSearching: Bool {
        showSearch && !chatService.searchText.isEmpty
    }

    var body: some View {
        NavigationStack(path: $navigationPath) {
            ZStack(alignment: .bottomTrailing) {
            List {
                // MARK: - Title Bar
                HStack {
                    if !showSearch {
                        Text(L10n.General.appName)
                            .font(.system(size: 28, weight: .bold))
                            .transition(.opacity)
                    }
                    Spacer()
                    if showSearch {
                        HStack(spacing: 8) {
                            Image(systemName: "magnifyingglass")
                        .font(.system(size: 14))
                                .foregroundColor(.secondary)
                            TextField(L10n.General.search, text: $chatService.searchText)
                                .font(.system(size: 15))
                                .textFieldStyle(.plain)
                                .focused($searchFocused)
                            Button {
                                withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                                    showSearch = false
                                    chatService.searchText = ""
                                }
                            } label: {
                                Image(systemName: "xmark")
                        .font(.system(size: 12))
                                    .foregroundColor(.secondary)
                                    .frame(width: 24, height: 24)
                                    .background(Color(.systemGray4))
                                    .clipShape(Circle())
                            }
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .glassEffect(.regular, in: .capsule)
                        .transition(.scale(scale: 0.5, anchor: .trailing).combined(with: .opacity))
                    } else {
                        HStack(spacing: 18) {
                            Image(systemName: "magnifyingglass")
                        .font(.system(size: 22))
                                .foregroundColor(Color(.systemGray))
                                .contentShape(Rectangle())
                                .onTapGesture {
                                    withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                                        showSearch = true
                                    }
                                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                                        searchFocused = true
                                    }
                                }

                            Image(systemName: "line.3.horizontal")
                        .font(.system(size: 22))
                                .foregroundColor(Color(.systemGray))
                                .contentShape(Rectangle())
                                .onTapGesture {
                                    navigationPath.append(NavigationTarget.settings)
                                }
                        }
                        .transition(.scale(scale: 0.8, anchor: .trailing).combined(with: .opacity))
                    }
                }
                .listRowInsets(EdgeInsets(top: 8, leading: 20, bottom: 4, trailing: 20))
                .listRowSeparator(.hidden)

                if isSearching {
                    // MARK: - Search Results
                    if !chatService.filteredProjects.isEmpty {
                        Section {
                            ForEach(chatService.filteredProjects) { project in
                                Button {
                                    navigationPath.append(NavigationTarget.project(project.id))
                                } label: {
                                    HStack(spacing: 10) {
                                        Image(systemName: "folder")
                        .font(.system(size: 14))
                                            .foregroundColor(.secondary)
                                        Text(project.name)
                                            .font(.system(size: 15))
                                            .foregroundColor(.primary)
                                            .lineLimit(1)
                                    }
                                }
                                .listRowSeparator(.hidden)
                            }
                        } header: {
                            Text(L10n.Home.projects)
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(.secondary)
                                .textCase(nil)
                        }
                    }

                    if !chatService.sortedConversations.isEmpty {
                        Section {
                            ForEach(chatService.sortedConversations) { conv in
                                Button {
                                    navigationPath.append(NavigationTarget.conversation(conv.id))
                                } label: {
                                    HStack(spacing: 10) {
                                        Image(systemName: "bubble.left")
                        .font(.system(size: 14))
                                            .foregroundColor(.secondary)
                                        Text(conv.title)
                                            .font(.system(size: 15))
                                            .foregroundColor(.primary)
                                            .lineLimit(1)
                                    }
                                }
                                .listRowSeparator(.hidden)
                            }
                        } header: {
                            Text(L10n.Home.conversations)
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(.secondary)
                                .textCase(nil)
                        }
                    }

                    if chatService.filteredProjects.isEmpty && chatService.sortedConversations.isEmpty {
                        ContentUnavailableView.search(text: chatService.searchText)
                            .listRowSeparator(.hidden)
                    }
                } else {
                    // MARK: - Agents Strip
                    Section {
                        AgentStripView(
                            onAgentTap: { agentId in
                                navigationPath.append(NavigationTarget.agentDetail(agentId))
                            },
                            onCreateTap: {
                                navigationPath.append(NavigationTarget.createAgent)
                            }
                        )
                    }
                    .listRowInsets(EdgeInsets())
                    .listRowSeparator(.hidden)

                    // MARK: - Projects Section
                    Section {
                        VStack(alignment: .leading, spacing: 0) {
                            Text(L10n.Home.projects)
                                .font(.system(size: 18, weight: .semibold))
                                .padding(.horizontal, 20)
                                .padding(.top, 12)
                                .padding(.bottom, 8)

                            ForEach(chatService.projects.prefix(visibleProjectCount)) { project in
                                Button {
                                    navigationPath.append(NavigationTarget.project(project.id))
                                } label: {
                                    HStack(spacing: 12) {
                                        Image(systemName: "folder")
                        .font(.system(size: 16))
                                            .foregroundColor(.primary)
                                        Text(project.name)
                                            .font(.system(size: 15))
                                            .foregroundColor(.primary)
                                            .lineLimit(1)
                                    }
                                    .padding(.horizontal, 20)
                                    .padding(.vertical, 14)
                                    .contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                            }

                            if chatService.projects.count > visibleProjectCount {
                                Button {
                                    showAllProjects = true
                                } label: {
                                    Text(L10n.Home.seeAll)
                                        .font(.system(size: 14, weight: .medium))
                                        .foregroundColor(.secondary)
                                        .padding(.horizontal, 20)
                                        .padding(.top, 16)
                                        .padding(.bottom, 0)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                    .listRowInsets(EdgeInsets())
                    .listRowSeparator(.hidden)

                    // MARK: - Conversations
                    Section {
                        ForEach(chatService.sortedConversations) { conv in
                            conversationButton(conv)
                        }
                    } header: {
                        Text(L10n.Home.conversations)
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundColor(.primary)
                            .textCase(nil)
                            .padding(.top, 4)
                    }
                }
            }
            .listStyle(.plain)
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar(.hidden, for: .navigationBar)

                // Floating Chat button
                Button {
                    guard let context = chatService.defaultConversationContext(),
                          let convId = chatService.createConversation(agentId: context.agent.id, projectId: context.project.id) else { return }
                    navigationPath.append(NavigationTarget.conversation(convId))
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "square.and.pencil")
                        .font(.system(size: 16))
                        Text(L10n.General.chat)
                            .font(.system(size: 16, weight: .semibold))
                    }
                    .foregroundColor(.black)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 12)
                    .background(Color.white)
                    .clipShape(Capsule())
                }
                .shadow(color: .black.opacity(0.3), radius: 10, y: 4)
                .padding(.trailing, 20)
                .padding(.bottom, 20)
            }
            .sheet(isPresented: $showAllProjects) {
                AllProjectsSheet(navigationPath: $navigationPath, showSheet: $showAllProjects)
            }
            .navigationDestination(for: NavigationTarget.self) { target in
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
                    // TODO: all projects view
                    Text(L10n.Home.allProjects)
                case .topic(let id):
                    if let topic = chatService.topic(for: id) {
                        TopicDetailView(topic: topic, navigationPath: $navigationPath)
                    }
                case .settings:
                    SettingsView()
                }
            }
        }
    }

    private func conversationButton(_ conv: Conversation) -> some View {
        Button {
            navigationPath.append(NavigationTarget.conversation(conv.id))
        } label: {
            ConversationRow(conversation: conv)
        }
        .listRowInsets(EdgeInsets(top: 1, leading: 20, bottom: 1, trailing: 20))
        .listRowSeparator(.hidden)
        .swipeActions(edge: .trailing) {
            Button(role: .destructive) {
                chatService.deleteConversation(conv.id)
            } label: {
                Label(L10n.General.delete, systemImage: "trash")
            }
        }
    }
}

// MARK: - Conversation Row

struct ConversationRow: View {
    @EnvironmentObject private var chatService: ChatService
    let conversation: Conversation

    private var agent: Agent? {
        chatService.agent(for: conversation.agentId)
    }

    var body: some View {
        HStack(spacing: 8) {
            Text(conversation.title)
                .font(.system(size: 15))
                .foregroundColor(.primary)
                .lineLimit(1)
            Spacer()
            if conversation.status == .unread || conversation.status == .streaming || conversation.status == .thinking {
                Circle()
                    .fill(Color.blue)
                    .frame(width: 8, height: 8)
            }
        }
        .contentShape(Rectangle())
    }
}

// MARK: - All Projects Sheet

struct AllProjectsSheet: View {
    @EnvironmentObject private var chatService: ChatService
    @Binding var navigationPath: NavigationPath
    @Binding var showSheet: Bool

    var body: some View {
        NavigationStack {
            List {
                ForEach(chatService.projects) { project in
                    Button {
                        showSheet = false
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                            navigationPath.append(NavigationTarget.project(project.id))
                        }
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: "folder")
                        .font(.system(size: 16))
                                .foregroundColor(.primary)
                            Text(project.name)
                                .font(.system(size: 15))
                                .foregroundColor(.primary)
                                .lineLimit(1)
                        }
                    }
                    .listRowSeparator(.hidden)
                }
            }
            .listStyle(.plain)
            .navigationTitle(L10n.Home.projects)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button(L10n.General.close) { showSheet = false }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    EmptyView()
                }
            }
        }
    }
}
