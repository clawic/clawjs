import SwiftUI

struct SidebarView: View {
    @EnvironmentObject private var chatService: ChatService
    @Binding var selection: SidebarItem?
    var onNewChat: () -> Void

    var body: some View {
        List(selection: $selection) {
            Section(L10n.Home.projects) {
                ForEach(chatService.projects) { project in
                    Label(project.name, systemImage: "folder")
                        .tag(SidebarItem.project(project.id))
                }
            }

            Section(L10n.Settings.agents) {
                ForEach(chatService.agents) { agent in
                    HStack(spacing: 8) {
                        Image(systemName: agent.icon)
                            .frame(width: 18)
                            .foregroundStyle(.secondary)
                        Text(agent.name)
                        Spacer()
                        let unread = chatService.unreadCount(for: agent.id)
                        if unread > 0 {
                            Text("\(unread)")
                                .font(.caption2.weight(.semibold))
                                .foregroundColor(.white)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 1)
                                .background(Color.accentColor, in: Capsule())
                        }
                    }
                    .tag(SidebarItem.agent(agent.id))
                }
            }

            Section(L10n.Home.conversations) {
                ForEach(chatService.sortedConversations) { conv in
                    HStack(spacing: 8) {
                        Image(systemName: "bubble.left")
                            .frame(width: 18)
                            .foregroundStyle(.secondary)
                        Text(conv.title).lineLimit(1)
                        Spacer()
                        if conv.status != .read {
                            Circle()
                                .fill(Color.accentColor)
                                .frame(width: 7, height: 7)
                        }
                    }
                    .tag(SidebarItem.conversation(conv.id))
                    .contextMenu {
                        Button(role: .destructive) {
                            chatService.deleteConversation(conv.id)
                        } label: {
                            Label(L10n.General.delete, systemImage: "trash")
                        }
                    }
                }
            }
        }
        .listStyle(.sidebar)
        .safeAreaInset(edge: .top, spacing: 0) {
            HStack(spacing: 8) {
                Image(systemName: "sparkles")
                    .foregroundStyle(Color.accentColor)
                    .font(.system(size: 15, weight: .semibold))
                Text(L10n.General.appName)
                    .font(.system(size: 15, weight: .semibold))
                Spacer()
                Button(action: onNewChat) {
                    Image(systemName: "square.and.pencil")
                        .font(.system(size: 14, weight: .medium))
                }
                .buttonStyle(.borderless)
                .help(L10n.Home.newChat)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(.ultraThinMaterial)
            .overlay(
                Divider(),
                alignment: .bottom
            )
        }
    }
}
