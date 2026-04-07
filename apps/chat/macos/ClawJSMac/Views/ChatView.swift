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

    private var isThinking: Bool { currentConversation.status == .thinking }
    private var isStreaming: Bool { currentConversation.status == .streaming }
    private var isBusy: Bool { isThinking || isStreaming }

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider()
            messagesView
            ChatInputBar(
                text: $messageText,
                placeholder: isBusy ? L10n.Chat.waiting : L10n.Chat.messagePlaceholder,
                isDisabled: isBusy,
                autofocus: true,
                onSend: sendMessage
            )
        }
        .background(Color(nsColor: .windowBackgroundColor))
        .onAppear {
            chatService.markAsRead(conversationId: conversationId)
            chatService.loadMessages(for: conversationId)
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack(spacing: 14) {
            Image(systemName: agent?.icon ?? "brain.head.profile")
                .font(.system(size: 20, weight: .medium))
                .foregroundStyle(Color.accentColor)
                .frame(width: 42, height: 42)
                .background(Color.accentColor.opacity(0.12), in: Circle())

            VStack(alignment: .leading, spacing: 2) {
                Text(agent?.name ?? "Agent")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                HStack(spacing: 6) {
                    if let project {
                        Image(systemName: "folder")
                            .font(.system(size: 10))
                        Text(project.name)
                    }
                    if isThinking {
                        Text(" . " + L10n.Chat.thinking.lowercased())
                            .foregroundStyle(Color.accentColor)
                    } else if isStreaming {
                        Text(" . " + L10n.Chat.thinking.lowercased())
                            .foregroundStyle(Color.accentColor)
                    }
                }
                .font(.system(size: 11))
                .foregroundStyle(.secondary)
                .lineLimit(1)
            }

            Spacer()

            Button {
                guard let agentId = agent?.id ?? chatService.agents.first?.id,
                      let projectId = currentConversation.projectId ?? chatService.defaultProject(for: agentId)?.id,
                      let newId = chatService.createConversation(agentId: agentId, projectId: projectId) else { return }
                messageText = ""
                activeConversationId = newId
            } label: {
                Image(systemName: "square.and.pencil")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(.primary)
                    .frame(width: 32, height: 32)
                    .background(.regularMaterial, in: Circle())
                    .overlay(Circle().strokeBorder(Color.primary.opacity(0.08), lineWidth: 1))
            }
            .buttonStyle(.plain)
            .help(L10n.Home.newChat)
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 16)
    }

    // MARK: - Messages

    private var messagesView: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 18) {
                    ForEach(currentConversation.messages) { message in
                        let isStreamingMsg = isStreaming
                            && message.id == currentConversation.messages.last?.id
                            && message.role == .agent
                        MessageRow(
                            message: message,
                            agent: agent,
                            isStreaming: isStreamingMsg,
                            onStreamingDone: {
                                chatService.finishStreaming(conversationId: conversationId)
                            }
                        )
                        .id(message.id)
                    }

                    if isThinking {
                        ThinkingRow(agent: agent)
                            .id("thinking")
                    }
                }
                .padding(.horizontal, 28)
                .padding(.vertical, 20)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .onChange(of: currentConversation.messages.count) { _, _ in scrollToBottom(proxy) }
            .onChange(of: isThinking) { _, _ in scrollToBottom(proxy) }
            .onChange(of: isStreaming) { _, _ in scrollToBottom(proxy) }
            .onAppear { scrollToBottom(proxy) }
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

    // MARK: - Actions

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
    var agent: Agent?
    var isStreaming: Bool = false
    var onStreamingDone: (() -> Void)? = nil

    private var isUser: Bool { message.role == .user }

    var body: some View {
        if isUser {
            HStack(alignment: .top) {
                Spacer(minLength: 60)
                Text(message.text)
                    .font(.system(size: 14))
                    .foregroundStyle(.primary)
                    .textSelection(.enabled)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .fill(Color.accentColor.opacity(0.18))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .strokeBorder(Color.accentColor.opacity(0.25), lineWidth: 1)
                    )
                    .frame(maxWidth: 560, alignment: .trailing)
            }
        } else {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: agent?.icon ?? "brain.head.profile")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Color.accentColor)
                    .frame(width: 28, height: 28)
                    .background(Color.accentColor.opacity(0.12), in: Circle())

                VStack(alignment: .leading, spacing: 8) {
                    if isStreaming {
                        StreamingText(text: message.text, onDone: onStreamingDone)
                    } else {
                        Text(message.text)
                            .font(.system(size: 14))
                            .foregroundStyle(.primary)
                            .lineSpacing(4)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .textSelection(.enabled)
                    }

                    if !isStreaming && !message.text.isEmpty {
                        MessageActions()
                    }
                }
            }
        }
    }
}

// MARK: - Thinking row

struct ThinkingRow: View {
    var agent: Agent?
    @State private var pulse = false

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: agent?.icon ?? "brain.head.profile")
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(Color.accentColor)
                .frame(width: 28, height: 28)
                .background(Color.accentColor.opacity(0.12), in: Circle())

            HStack(spacing: 5) {
                ForEach(0..<3) { i in
                    Circle()
                        .fill(Color.secondary)
                        .frame(width: 7, height: 7)
                        .opacity(pulse ? 0.3 : 1.0)
                        .animation(
                            .easeInOut(duration: 0.6)
                                .repeatForever()
                                .delay(Double(i) * 0.15),
                            value: pulse
                        )
                }
            }
            .padding(.top, 6)
        }
        .onAppear { pulse = true }
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
            .font(.system(size: 14))
            .foregroundStyle(.primary)
            .lineSpacing(4)
            .frame(maxWidth: .infinity, alignment: .leading)
            .onAppear { startStreaming() }
            .onDisappear { timer?.invalidate(); timer = nil }
    }

    private func startStreaming() {
        displayLen = 0
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
        HStack(spacing: 4) {
            actionButton("doc.on.doc")
            actionButton("hand.thumbsup")
            actionButton("hand.thumbsdown")
            actionButton("arrow.clockwise")
            actionButton("square.and.arrow.up")
        }
    }

    private func actionButton(_ systemName: String) -> some View {
        Button(action: {}) {
            Image(systemName: systemName)
                .font(.system(size: 11))
                .foregroundStyle(.secondary)
                .frame(width: 24, height: 24)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
