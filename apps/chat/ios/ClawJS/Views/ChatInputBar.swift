import SwiftUI

struct ChatInputBar: View {
    @Binding var text: String
    var placeholder: String = "Message"
    var isDisabled: Bool = false
    var autofocus: Bool = false
    var onSend: () -> Void
    @FocusState private var isInputFocused: Bool

    private var canSend: Bool {
        !isDisabled && !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        HStack(spacing: 12) {
            Button {
            } label: {
                Image(systemName: "plus")
                        .font(.system(size: 20))
                    .foregroundColor(.white)
            }

            TextField(
                placeholder,
                text: $text,
                axis: .vertical
            )
            .lineLimit(1...6)
            .focused($isInputFocused)
            .disabled(isDisabled)
            .font(.system(size: 16))
            .foregroundColor(.primary)

            Spacer(minLength: 0)

            if canSend {
                Button {
                    onSend()
                } label: {
                    Image(systemName: "arrow.up")
                        .font(.system(size: 14))
                        .foregroundColor(.black)
                        .frame(width: 34, height: 34)
                        .background(Color.white)
                        .clipShape(Circle())
                }
                .transition(.scale.combined(with: .opacity))
            } else {
                Button {
                } label: {
                    Image(systemName: "mic")
                        .font(.system(size: 17))
                        .foregroundColor(Color(.systemGray))
                }

                Button {
                } label: {
                    HStack(spacing: 1.5) {
                        Capsule()
                            .fill(Color.black)
                            .frame(width: 2, height: 5)
                        Capsule()
                            .fill(Color.black)
                            .frame(width: 2, height: 14)
                        Capsule()
                            .fill(Color.black)
                            .frame(width: 2, height: 7)
                        Capsule()
                            .fill(Color.black)
                            .frame(width: 2, height: 16)
                        Capsule()
                            .fill(Color.black)
                            .frame(width: 2, height: 9)
                        Capsule()
                            .fill(Color.black)
                            .frame(width: 2, height: 4)
                    }
                    .frame(width: 34, height: 34)
                    .background(Color.white)
                    .clipShape(Circle())
                }
            }
        }
        .padding(.leading, 14)
        .padding(.trailing, 6)
        .padding(.vertical, 6)
        .glassEffect(.regular, in: .capsule)
        .padding(.horizontal, 14)
        .padding(.bottom, 10)
        .padding(.top, 6)
        .animation(.easeInOut(duration: 0.15), value: canSend)
        .onAppear {
            if autofocus {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                    isInputFocused = true
                }
            }
        }
    }
}
