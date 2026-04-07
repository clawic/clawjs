import SwiftUI

struct AvatarView: View {
    let agent: Agent
    let size: CGFloat

    var body: some View {
        Image(systemName: agent.icon)
            .font(.system(size: size * 0.38, weight: .medium))
            .foregroundStyle(.primary)
            .frame(width: size, height: size)
            .background(
                Circle().fill(.regularMaterial)
            )
            .overlay(
                Circle().strokeBorder(Color.primary.opacity(0.08), lineWidth: 1)
            )
    }
}
