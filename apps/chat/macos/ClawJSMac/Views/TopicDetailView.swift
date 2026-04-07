import SwiftUI

struct TopicDetailView: View {
    @EnvironmentObject private var chatService: ChatService
    let topic: Topic
    @Binding var navigationPath: NavigationPath
    @State private var messageText = ""

    private var conversations: [Conversation] {
        chatService.conversationsForTopic(topic.id)
    }

    private var project: Project? {
        chatService.project(for: topic.projectId)
    }

    private var availableAgents: [Agent] {
        chatService.agentsForProject(topic.projectId)
    }

    var body: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 10) {
                    Image(systemName: "number")
                        .font(.system(size: 24))
                        .foregroundColor(.primary)
                    Text(topic.name)
                        .font(.system(size: 26, weight: .bold))
                        .foregroundColor(.primary)
                }
                .padding(.horizontal, 20)

                if let project {
                    Text(project.name)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(.secondary)
                        .padding(.horizontal, 20)
                }
            }
            .padding(.top, 16)
            .padding(.bottom, 8)

            Group {
                if conversations.isEmpty {
                    Spacer()
                    ContentUnavailableView(
                        L10n.Project.noConversations,
                        systemImage: "bubble.left",
                        description: Text(L10n.Project.startConversationIn(topic.name))
                    )
                    Spacer()
                } else {
                    List {
                        ForEach(conversations) { conv in
                            Button {
                                navigationPath.append(NavigationTarget.conversation(conv.id))
                            } label: {
                                ProjectConversationRow(conversation: conv)
                            }
                            .buttonStyle(.plain)
                            .listRowInsets(EdgeInsets(top: 6, leading: 20, bottom: 6, trailing: 20))
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

            ChatInputBar(
                text: $messageText,
                placeholder: L10n.Chat.sendMessageTo(topic.name),
                onSend: sendMessage
            )
        }
        .background(Color(.systemBackground))
    }

    private func sendMessage() {
        let text = messageText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        guard let firstAgent = availableAgents.first else { return }
        messageText = ""
        guard let convId = chatService.createConversation(
            agentId: firstAgent.id,
            projectId: topic.projectId,
            topicId: topic.id
        ) else { return }
        chatService.sendMessage(in: convId, text: text)
        navigationPath.append(NavigationTarget.conversation(convId))
    }
}
