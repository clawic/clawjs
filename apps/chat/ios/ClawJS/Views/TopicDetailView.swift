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
            // Topic header
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
            }
            .padding(.top, 12)
            .padding(.bottom, 8)

            // Conversations list
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
                            .listRowInsets(EdgeInsets(top: 6, leading: 20, bottom: 6, trailing: 20))
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
                    .listStyle(.plain)
                }
            }

            // Input bar
            ChatInputBar(
                text: $messageText,
                placeholder: L10n.Chat.sendMessageTo(topic.name),
                onSend: sendMessage
            )
        }
        .background(Color(.systemBackground))
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                HStack(spacing: 8) {
                    Button {
                        navigationPath.removeLast()
                    } label: {
                        Image(systemName: "minus")
                        .font(.system(size: 14))
                            .foregroundColor(.primary)
                            .frame(width: 36, height: 36)
                            .background(Color(.systemGray5))
                            .clipShape(Circle())
                    }

                    if let project {
                        Text(project.name)
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(.primary)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 8)
                            .background(Color(.systemGray5))
                            .clipShape(Capsule())
                    }

                    Text(topic.name)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(.primary)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .background(Color(.systemGray5))
                        .clipShape(Capsule())
                }
            }

            ToolbarItem(placement: .topBarTrailing) {
                HStack(spacing: 2) {
                    Button {
                    } label: {
                        Image(systemName: "square.and.arrow.up")
                        .font(.system(size: 14))
                            .foregroundColor(.primary)
                            .frame(width: 36, height: 36)
                    }

                    Button {
                    } label: {
                        Image(systemName: "ellipsis")
                        .font(.system(size: 14))
                            .foregroundColor(.primary)
                            .frame(width: 36, height: 36)
                    }
                }
                .background(Color(.systemGray5))
                .clipShape(Capsule())
            }
        }
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
