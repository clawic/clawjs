import SwiftUI

struct Ph: View {
    let name: String
    var size: CGFloat = 20

    var body: some View {
        Image(name)
            .resizable()
            .scaledToFit()
            .frame(width: size, height: size)
    }
}
