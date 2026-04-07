import SwiftUI

struct StatusBadgeView: View {
    let status: ConversationStatus

    var body: some View {
        switch status {
        case .thinking, .streaming:
            ProgressView()
                .controlSize(.mini)
                .tint(Color(.systemGray3))
        case .unread:
            Circle()
                .fill(Color(.label))
                .frame(width: 8, height: 8)
        case .read:
            EmptyView()
        }
    }
}
