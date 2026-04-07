import SwiftUI

struct AgentStripView: View {
    @EnvironmentObject private var chatService: ChatService
    let onAgentTap: (UUID) -> Void
    var onCreateTap: () -> Void = {}

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 16) {
                ForEach(chatService.agents) { agent in
                    AgentChip(
                        agent: agent,
                        onTap: { onAgentTap(agent.id) }
                    )
                }

                if chatService.canCreateAgents {
                    AddAgentChip(onTap: onCreateTap)
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 14)
        }
    }
}

// MARK: - Agent Chip

private struct AgentChip: View {
    let agent: Agent
    let onTap: () -> Void

    var body: some View {
        VStack(spacing: 6) {
            AvatarView(agent: agent, size: 48)
                .onTapGesture(perform: onTap)

            Text(agent.name)
                .font(.system(size: 11, weight: .regular))
                .foregroundColor(.secondary)
                .lineLimit(1)
        }
        .frame(width: 56)
    }
}

// MARK: - Add Agent Chip

private struct AddAgentChip: View {
    let onTap: () -> Void

    var body: some View {
        VStack(spacing: 6) {
            Image(systemName: "plus")
                .font(.system(size: 20))
                .foregroundColor(.secondary)
                .frame(width: 48, height: 48)
                .background(Circle().fill(.regularMaterial))
                .overlay(Circle().strokeBorder(Color.primary.opacity(0.08), lineWidth: 1))
                .onTapGesture(perform: onTap)

            Text(L10n.General.create)
                .font(.system(size: 11, weight: .regular))
                .foregroundColor(.secondary)
                .lineLimit(1)
        }
        .frame(width: 56)
    }
}
