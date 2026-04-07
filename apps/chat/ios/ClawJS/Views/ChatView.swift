import SwiftUI

struct ChatView: View {
    @EnvironmentObject private var chatService: ChatService
    let conversation: Conversation
    @Binding var navigationPath: NavigationPath
    @State private var messageText = ""
    @State private var activeConversationId: UUID?

    private var conversationId: UUID {
        activeConversationId ?? conversation.id
    }

    private var currentConversation: Conversation {
        chatService.conversations.first(where: { $0.id == conversationId }) ?? conversation
    }

    private var agent: Agent? {
        chatService.agent(for: currentConversation.agentId)
    }

    private var project: Project? {
        currentConversation.projectId.flatMap(chatService.project(for:))
    }

    private var isThinking: Bool {
        currentConversation.status == .thinking
    }

    private var isStreaming: Bool {
        currentConversation.status == .streaming
    }

    private var isBusy: Bool {
        isThinking || isStreaming
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            messagesView
                .padding(.bottom, 60)
            inputBar
        }
        .safeAreaInset(edge: .top) {
            customNavBar
        }
        .background(Color(.systemBackground))
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .toolbar(.hidden, for: .navigationBar)
        .onAppear {
            chatService.markAsRead(conversationId: conversationId)
            chatService.loadMessages(for: conversationId)
        }
    }

    // MARK: - Custom Nav Bar

    private var customNavBar: some View {
        HStack(spacing: 8) {
            Button {
                navigationPath.removeLast()
            } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.primary)
                    .frame(width: 36, height: 36)
            }
            .glassEffect(.regular, in: .circle)

            HStack(spacing: 6) {
                if let project {
                    Text(project.name)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(.primary)
                        .lineLimit(1)
                }
                Text(agent?.name ?? "Agent")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.primary)
                    .lineLimit(1)
            }
            .padding(.horizontal, 14)
            .frame(height: 36)
            .glassEffect(.regular, in: .capsule)

            Spacer()

            HStack(spacing: -4) {
                Button {
                    guard let agentId = agent?.id ?? chatService.agents.first?.id,
                          let projectId = currentConversation.projectId ?? chatService.defaultProject(for: agentId)?.id,
                          let newId = chatService.createConversation(agentId: agentId, projectId: projectId) else { return }
                    messageText = ""
                    activeConversationId = newId
                } label: {
                    Image("EditIcon")
                        .renderingMode(.template)
                        .resizable()
                        .scaledToFit()
                        .frame(width: 16, height: 16)
                        .foregroundColor(.primary)
                        .frame(width: 36, height: 36)
                }
                Button { } label: {
                    VStack(spacing: 5) {
                        RoundedRectangle(cornerRadius: 1.5)
                            .fill(Color.primary)
                            .frame(width: 16, height: 2.5)
                        RoundedRectangle(cornerRadius: 1.5)
                            .fill(Color.primary)
                            .frame(width: 12, height: 2.5)
                    }
                    .frame(width: 36, height: 36)
                }
            }
            .padding(.horizontal, 4)
            .glassEffect(.regular, in: .capsule)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 8)
    }

    // MARK: - Messages

    private var messagesView: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 20) {
                    ForEach(currentConversation.messages) { message in
                        let isStreamingMsg = isStreaming
                            && message.id == currentConversation.messages.last?.id
                            && message.role == .agent
                        MessageRow(
                            message: message,
                            isStreaming: isStreamingMsg,
                            onStreamingDone: {
                                chatService.finishStreaming(conversationId: conversationId)
                            }
                        )
                        .id(message.id)
                    }

                    if isThinking {
                        ThinkingIndicatorView()
                            .id("thinking")
                    }
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 16)
            }
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: currentConversation.messages.count) { _, _ in
                scrollToBottom(proxy)
            }
            .onChange(of: isThinking) { _, _ in
                scrollToBottom(proxy)
            }
            .onChange(of: isStreaming) { _, _ in
                scrollToBottom(proxy)
            }
            .onAppear {
                scrollToBottom(proxy)
            }
        }
    }

    private func scrollToBottom(_ proxy: ScrollViewProxy) {
        withAnimation(.easeOut(duration: 0.25)) {
            if isThinking {
                proxy.scrollTo("thinking", anchor: .bottom)
            } else if let lastId = currentConversation.messages.last?.id {
                proxy.scrollTo(lastId, anchor: .bottom)
            }
        }
    }

    // MARK: - Input Bar

    private var inputBar: some View {
        ChatInputBar(
            text: $messageText,
            placeholder: isBusy ? L10n.Chat.waiting : L10n.Chat.messagePlaceholder,
            isDisabled: isBusy,
            autofocus: true,
            onSend: sendMessage
        )
    }

    private func sendMessage() {
        let text = messageText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        messageText = ""
        chatService.sendMessage(in: conversationId, text: text)
    }
}

// MARK: - Message Row

struct MessageRow: View {
    let message: Message
    var isStreaming: Bool = false
    var onStreamingDone: (() -> Void)? = nil

    private var isUser: Bool { message.role == .user }

    var body: some View {
        if isUser {
            HStack {
                Spacer()
                Text(message.text)
                    .font(.system(size: 15))
                    .foregroundColor(.primary)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(Color(.systemGray5))
                    .clipShape(RoundedRectangle(cornerRadius: 18))
            }
        } else {
            VStack(alignment: .leading, spacing: 12) {
                if isStreaming {
                    StreamingText(text: message.text, onDone: onStreamingDone)
                } else {
                    Text(message.text)
                        .font(.system(size: 16))
                        .foregroundColor(.primary)
                        .lineSpacing(4)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                if !isStreaming && !message.text.isEmpty {
                    MessageActions()
                        .transition(.opacity)
                        .animation(.easeIn(duration: 0.3), value: isStreaming)
                }
            }
        }
    }
}

// MARK: - Streaming Text

struct StreamingText: View {
    let text: String
    var onDone: (() -> Void)?
    @State private var displayLen: Int = 0
    @State private var timer: Timer?

    var body: some View {
        Text(text.prefix(displayLen))
            .font(.system(size: 16))
            .foregroundColor(.primary)
            .lineSpacing(4)
            .frame(maxWidth: .infinity, alignment: .leading)
            .onAppear { startStreaming() }
            .onDisappear { timer?.invalidate(); timer = nil }
    }

    private func startStreaming() {
        displayLen = 0
        // Constant speed: ~2 characters per tick at 60fps = ~120 chars/sec
        // A 300-char response takes ~2.5 seconds to animate
        timer = Timer.scheduledTimer(withTimeInterval: 1.0 / 60.0, repeats: true) { t in
            displayLen = min(displayLen + 2, text.count)
            if displayLen >= text.count {
                t.invalidate()
                onDone?()
            }
        }
    }
}

// MARK: - Message Actions

struct MessageActions: View {
    var body: some View {
        HStack(spacing: 12) {
            actionButton("doc.on.doc")
            actionButton("speaker.wave.2")
            actionButton("hand.thumbsup")
            actionButton("hand.thumbsdown")
            actionButton("square.and.arrow.up")
            actionButton("ellipsis")
        }
    }

    private func actionButton(_ systemName: String) -> some View {
        Button {
        } label: {
            Image(systemName: systemName)
                .font(.system(size: 12))
                .foregroundColor(Color(.systemGray))
        }
    }
}
