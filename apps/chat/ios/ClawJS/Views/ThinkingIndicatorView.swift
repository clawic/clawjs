import SwiftUI

struct ThinkingIndicatorView: View {
    @State private var animating = false

    var body: some View {
        Circle()
            .fill(Color.white)
            .frame(width: 8, height: 8)
            .opacity(animating ? 0.3 : 1.0)
            .animation(.easeInOut(duration: 0.8).repeatForever(autoreverses: true), value: animating)
            .frame(maxWidth: .infinity, alignment: .leading)
            .onAppear { animating = true }
    }
}
