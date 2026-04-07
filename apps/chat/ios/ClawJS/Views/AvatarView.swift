import SwiftUI

struct AvatarView: View {
    let agent: Agent
    let size: CGFloat

    var body: some View {
        Image(systemName: agent.icon)
            .font(.system(size: size * 0.36))
            .foregroundColor(.primary)
            .frame(width: size, height: size)
            .glassEffect(.regular, in: .circle)
    }
}
