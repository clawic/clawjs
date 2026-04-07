import SwiftUI

struct ProjectDetailView: View {
    @EnvironmentObject private var chatService: ChatService
    let project: Project
    @Binding var navigationPath: NavigationPath
    @State private var selectedTab: DetailTab = .chats
    @State private var messageText = ""

    private var conversations: [Conversation] {
        chatService.conversationsForProject(project.id)
    }

    private var availableAgents: [Agent] {
        chatService.agentsForProject(project.id)
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            tabPicker
                .padding(.horizontal, 24)
                .padding(.bottom, 14)
            Divider()

            ZStack {
                switch selectedTab {
                case .chats:    chatsContent
                case .documents: documentsContent
                }
            }

            ChatInputBar(
                text: $messageText,
                placeholder: L10n.Chat.sendMessageTo(project.name),
                onSend: sendMessage
            )
        }
        .background(Color(nsColor: .windowBackgroundColor))
    }

    private var header: some View {
        HStack(spacing: 14) {
            Image(systemName: "folder.fill")
                .font(.system(size: 28))
                .foregroundStyle(Color.accentColor)
                .frame(width: 52, height: 52)
                .background(Color.accentColor.opacity(0.12), in: RoundedRectangle(cornerRadius: 12, style: .continuous))

            VStack(alignment: .leading, spacing: 4) {
                Text(project.name)
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                Text("\(availableAgents.count) \(L10n.Settings.agents.lowercased()) . \(conversations.count) \(L10n.Home.conversations.lowercased())")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
            }
            Spacer()
        }
        .padding(.horizontal, 24)
        .padding(.top, 24)
        .padding(.bottom, 16)
    }

    private var tabPicker: some View {
        Picker("", selection: $selectedTab) {
            Text(L10n.General.chats).tag(DetailTab.chats)
            Text(L10n.General.documents).tag(DetailTab.documents)
        }
        .pickerStyle(.segmented)
        .labelsHidden()
        .frame(maxWidth: 260, alignment: .leading)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private var chatsContent: some View {
        if conversations.isEmpty {
            ContentUnavailableView {
                Label(L10n.Project.noConversations, systemImage: "bubble.left")
            } description: {
                Text(L10n.Project.startConversationIn(project.name))
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            List {
                ForEach(conversations) { conv in
                    ConversationListRow(conversation: conv) {
                        navigationPath.append(NavigationTarget.conversation(conv.id))
                    }
                    .listRowInsets(EdgeInsets(top: 2, leading: 16, bottom: 2, trailing: 16))
                    .listRowSeparator(.hidden)
                    .contextMenu {
                        Button(role: .destructive) {
                            chatService.deleteConversation(conv.id)
                        } label: {
                            Label(L10n.General.delete, systemImage: "trash")
                        }
                    }
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
        }
    }

    private var documentsContent: some View {
        ScrollView {
            VStack(spacing: 0) {
                documentRow(name: "Q1 Planning Brief.pdf", icon: "doc.fill", color: .red, size: "2.4 MB")
                documentRow(name: "Landing Page Draft.png", icon: "photo.fill", color: .green, size: "1.1 MB")
                documentRow(name: "Service Agreement.pdf", icon: "doc.fill", color: .red, size: "540 KB")
                documentRow(name: "Brand Assets.jpg", icon: "photo.fill", color: .green, size: "320 KB")
                documentRow(name: "Annual Budget.xlsx", icon: "tablecells.fill", color: .teal, size: "890 KB")
                documentRow(name: "Meeting Notes.docx", icon: "doc.richtext.fill", color: .blue, size: "125 KB")
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 12)
        }
    }

    private func documentRow(name: String, icon: String, color: Color, size: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 20))
                .foregroundColor(color)
                .frame(width: 36, height: 36)
            VStack(alignment: .leading, spacing: 2) {
                Text(name)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(.primary)
                    .lineLimit(1)
                Text(size)
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)
            }
            Spacer()
            Image(systemName: "ellipsis")
                .font(.system(size: 13))
                .foregroundColor(.secondary)
        }
        .padding(.vertical, 10)
        .overlay(Divider(), alignment: .bottom)
    }

    private func sendMessage() {
        let text = messageText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        guard let firstAgent = availableAgents.first ?? chatService.agents.first else { return }
        messageText = ""
        guard let convId = chatService.createConversation(agentId: firstAgent.id, projectId: project.id) else { return }
        chatService.sendMessage(in: convId, text: text)
        navigationPath.append(NavigationTarget.conversation(convId))
    }
}

enum DetailTab: Hashable {
    case chats
    case documents
}

// MARK: - Conversation row

struct ConversationListRow: View {
    @EnvironmentObject private var chatService: ChatService
    let conversation: Conversation
    var onTap: () -> Void

    private var agent: Agent? { chatService.agent(for: conversation.agentId) }

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 12) {
                Image(systemName: agent?.icon ?? "bubble.left")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(.secondary)
                    .frame(width: 28, height: 28)
                    .background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 7, style: .continuous))

                VStack(alignment: .leading, spacing: 2) {
                    Text(conversation.title)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(.primary)
                        .lineLimit(1)
                    Text(conversation.lastMessagePreview)
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                }

                Spacer()

                if conversation.status != .read {
                    Circle()
                        .fill(Color.accentColor)
                        .frame(width: 8, height: 8)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .contentShape(RoundedRectangle(cornerRadius: 10))
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Legacy compatibility row (kept for other views)

struct ProjectConversationRow: View {
    let conversation: Conversation

    var body: some View {
        Text(conversation.title)
            .font(.system(size: 14))
            .foregroundColor(.primary)
            .lineLimit(1)
            .contentShape(Rectangle())
    }
}
