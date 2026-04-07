import SwiftUI

struct CreateAgentView: View {
    @EnvironmentObject private var chatService: ChatService
    @Binding var navigationPath: NavigationPath
    @State private var name = ""
    @State private var role = ""
    @State private var description = ""

    private var canSave: Bool {
        !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        && !role.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(spacing: 28) {
                    // Avatar preview
                    VStack(spacing: 12) {
                        Circle()
                            .fill(Color(.systemGray5))
                            .frame(width: 80, height: 80)
                            .overlay(
                                Group {
                                    if name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                                        Image(systemName: "person.fill")
                                            .font(.system(size: 32))
                                            .foregroundColor(.secondary)
                                    } else {
                                        Text(String(name.prefix(2)).uppercased())
                                            .font(.system(size: 28, weight: .medium))
                                            .foregroundColor(.primary)
                                    }
                                }
                            )

                        Text(L10n.Agent.newAgent)
                            .font(.system(size: 22, weight: .bold))
                            .foregroundColor(.primary)
                    }
                    .padding(.top, 24)

                    // Form fields
                    VStack(spacing: 20) {
                        fieldSection(L10n.AgentForm.name) {
                            TextField(L10n.AgentForm.namePlaceholder, text: $name)
                                .font(.system(size: 16))
                                .padding(.horizontal, 16)
                                .padding(.vertical, 14)
                                .background(Color(.systemGray6))
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                        }

                        fieldSection(L10n.AgentForm.role) {
                            TextField(L10n.AgentForm.rolePlaceholder, text: $role)
                                .font(.system(size: 16))
                                .padding(.horizontal, 16)
                                .padding(.vertical, 14)
                                .background(Color(.systemGray6))
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                        }

                        fieldSection(L10n.AgentForm.description) {
                            TextField(L10n.AgentForm.descriptionPlaceholder, text: $description, axis: .vertical)
                                .font(.system(size: 16))
                                .lineLimit(3...6)
                                .padding(.horizontal, 16)
                                .padding(.vertical, 14)
                                .background(Color(.systemGray6))
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                        }
                    }
                    .padding(.horizontal, 20)
                }
            }

            // Save button
            Button {
                save()
            } label: {
                Text(L10n.Agent.createAgent)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundColor(canSave ? Color(.systemBackground) : .secondary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .background(canSave ? Color.primary : Color(.systemGray5))
                    .clipShape(RoundedRectangle(cornerRadius: 14))
            }
            .disabled(!canSave)
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
        }
        .background(Color(.systemBackground))
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button {
                    navigationPath.removeLast()
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(.primary)
                        .frame(width: 36, height: 36)
                }
            }
        }
    }

    private func fieldSection<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(.secondary)
            content()
        }
    }

    private func save() {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedRole = role.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedDesc = description.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty, !trimmedRole.isEmpty else { return }

        chatService.addAgent(
            name: trimmedName,
            role: trimmedRole,
            description: trimmedDesc.isEmpty ? L10n.Agent.customAgent : trimmedDesc
        )
        navigationPath.removeLast()
    }
}
