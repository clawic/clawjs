import SwiftUI

struct AgentDetailView: View {
    @EnvironmentObject private var chatService: ChatService
    let agent: Agent
    @Binding var navigationPath: NavigationPath
    @State private var selectedTab: DetailTab = .chats
    @State private var messageText = ""

    private var conversations: [Conversation] {
        chatService.conversationsForAgent(agent.id)
    }

    private var defaultProject: Project? {
        chatService.defaultProject(for: agent.id)
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
                placeholder: L10n.Chat.sendMessageTo(agent.name),
                onSend: sendMessage
            )
        }
        .background(Color(nsColor: .windowBackgroundColor))
    }

    private var header: some View {
        HStack(spacing: 14) {
            Image(systemName: agent.icon)
                .font(.system(size: 26, weight: .medium))
                .foregroundStyle(Color.accentColor)
                .frame(width: 52, height: 52)
                .background(Color.accentColor.opacity(0.12), in: Circle())

            VStack(alignment: .leading, spacing: 4) {
                Text(agent.name)
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                Text(agent.role)
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
                Label(L10n.Agent.noConversations, systemImage: "bubble.left")
            } description: {
                Text(L10n.Agent.startConversationWith(agent.name))
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
                documentRow(name: "Training guide.pdf", icon: "doc.fill", color: .red, size: "1.8 MB")
                documentRow(name: "Prompt templates.docx", icon: "doc.richtext.fill", color: .blue, size: "95 KB")
                documentRow(name: "Screenshot.png", icon: "photo.fill", color: .green, size: "780 KB")
                documentRow(name: "Test data.csv", icon: "tablecells.fill", color: .teal, size: "2.3 MB")
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
        messageText = ""
        guard let projectId = defaultProject?.id ?? chatService.projects.first?.id,
              let convId = chatService.createConversation(agentId: agent.id, projectId: projectId) else { return }
        chatService.sendMessage(in: convId, text: text)
        navigationPath.append(NavigationTarget.conversation(convId))
    }
}
