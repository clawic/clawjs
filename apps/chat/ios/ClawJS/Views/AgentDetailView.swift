import SwiftUI

struct AgentDetailView: View {
    @EnvironmentObject private var chatService: ChatService
    let agent: Agent
    @Binding var navigationPath: NavigationPath
    @State private var selectedTab = 0
    @State private var messageText = ""

    private var conversations: [Conversation] {
        chatService.conversationsForAgent(agent.id)
    }

    private var defaultProject: Project? {
        chatService.defaultProject(for: agent.id)
    }

    var body: some View {
        VStack(spacing: 0) {
            // Agent header
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 10) {
                    Image(systemName: "folder.fill")
                        .font(.system(size: 24))
                        .foregroundColor(.primary)

                    Text(agent.name)
                        .font(.system(size: 26, weight: .bold))
                        .foregroundColor(.primary)
                }
                .padding(.horizontal, 20)

                // Tab selector
                HStack(spacing: 0) {
                    tabButton(L10n.General.chats, index: 0)
                    tabButton(L10n.General.documents, index: 1)
                    Spacer()
                }
                .padding(.horizontal, 16)
            }
            .padding(.top, 12)
            .padding(.bottom, 8)

            // Content
            if selectedTab == 0 {
                chatsContent
            } else {
                fuentesContent
            }

            inputBar
        }
        .safeAreaInset(edge: .top) {
            customNavBar
        }
        .background(Color(.systemBackground))
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .toolbar(.hidden, for: .navigationBar)
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

            Spacer()

            Button { } label: {
                Image(systemName: "ellipsis")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(.primary)
                    .frame(width: 36, height: 36)
            }
            .glassEffect(.regular, in: .circle)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 8)
    }

    // MARK: - Tab Button

    private func tabButton(_ title: String, index: Int) -> some View {
        Button {
            withAnimation(.easeInOut(duration: 0.2)) {
                selectedTab = index
            }
        } label: {
            Text(title)
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(selectedTab == index ? .primary : .secondary)
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .background(
                    selectedTab == index
                        ? Color(.systemGray5)
                        : Color.clear
                )
                .clipShape(Capsule())
        }
    }

    // MARK: - Chats Content

    private var chatsContent: some View {
        Group {
            if conversations.isEmpty {
                Spacer()
                ContentUnavailableView(
                    L10n.Agent.noConversations,
                    systemImage: "bubble.left",
                    description: Text(L10n.Agent.startConversationWith(agent.name))
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
    }

    // MARK: - Documentos Content

    private var fuentesContent: some View {
        ScrollView {
            VStack(spacing: 0) {
                documentRow(name: "Guia de entrenamiento.pdf", icon: "doc.fill", color: .red, size: "1.8 MB")
                documentRow(name: "Prompt templates.docx", icon: "doc.richtext.fill", color: .blue, size: "95 KB")
                documentRow(name: "Captura de pantalla.png", icon: "photo.fill", color: .green, size: "780 KB")
                documentRow(name: "Datos de prueba.csv", icon: "tablecells.fill", color: .teal, size: "2.3 MB")
                documentRow(name: "Flujo de conversacion.pdf", icon: "doc.fill", color: .red, size: "1.2 MB")
                documentRow(name: "Icono del agente.svg", icon: "square.on.circle.fill", color: .orange, size: "45 KB")
                documentRow(name: "Grabacion de llamada.mp3", icon: "waveform.circle.fill", color: .purple, size: "12.6 MB")
                documentRow(name: "FAQ del producto.pdf", icon: "doc.fill", color: .red, size: "650 KB")
                documentRow(name: "Inventario actualizado.xlsx", icon: "tablecells.fill", color: .teal, size: "3.1 MB")
                documentRow(name: "Foto de referencia.jpg", icon: "photo.fill", color: .green, size: "1.4 MB")
                documentRow(name: "Politica de privacidad.pdf", icon: "doc.fill", color: .red, size: "280 KB")
                documentRow(name: "Video tutorial.mp4", icon: "film.fill", color: .purple, size: "35.0 MB")
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
        }
    }

    private func documentRow(name: String, icon: String, color: Color, size: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 22))
                .foregroundColor(color)
                .frame(width: 36, height: 36)

            VStack(alignment: .leading, spacing: 2) {
                Text(name)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundColor(.primary)
                    .lineLimit(1)
                Text(size)
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
            }

            Spacer()

            Image(systemName: "ellipsis")
                .font(.system(size: 14))
                .foregroundColor(.secondary)
        }
        .padding(.vertical, 12)
        .overlay(
            Divider(), alignment: .bottom
        )
    }

    // MARK: - Input Bar

    private var inputBar: some View {
        ChatInputBar(
            text: $messageText,
            placeholder: L10n.Chat.sendMessageTo(agent.name),
            onSend: sendMessage
        )
    }

    private func sendMessage() {
        let text = messageText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        messageText = ""
        guard let projectId = defaultProject?.id,
              let convId = chatService.createConversation(agentId: agent.id, projectId: projectId) else { return }
        chatService.sendMessage(in: convId, text: text)
        navigationPath.append(NavigationTarget.conversation(convId))
    }
}
