import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var chatService: ChatService
    @AppStorage("notificationsEnabled") private var notificationsEnabled = true
    @AppStorage("soundEnabled") private var soundEnabled = true
    @AppStorage("hapticEnabled") private var hapticEnabled = true
    @AppStorage("selectedAppearance") private var selectedAppearance: AppearanceMode = .system
    @AppStorage("appLanguage") private var appLanguage = ""
    @AppStorage("relayBaseURL") private var relayBaseURL = "http://127.0.0.1:4410"
    @AppStorage("relayTenantId") private var relayTenantId = "demo-tenant"
    @AppStorage("relayEmail") private var relayEmail = "user@relay.local"
    @AppStorage("relayPassword") private var relayPassword = "relay-user"

    @State private var showDeleteAlert = false

    var body: some View {
        TabView {
            generalTab
                .tabItem { Label(L10n.Settings.appearance, systemImage: "paintbrush") }

            relayTab
                .tabItem { Label("Relay", systemImage: "network") }

            dataTab
                .tabItem { Label(L10n.Settings.data, systemImage: "internaldrive") }

            aboutTab
                .tabItem { Label(L10n.Settings.about, systemImage: "info.circle") }
        }
        .frame(width: 500, height: 560)
        .alert(L10n.Settings.deleteAllConversations, isPresented: $showDeleteAlert) {
            Button(L10n.General.cancel, role: .cancel) {}
            Button(L10n.General.delete, role: .destructive) {
                chatService.deleteAllConversations()
            }
        } message: {
            Text(L10n.Settings.deleteAllAlert)
        }
    }

    // MARK: - General

    private var generalTab: some View {
        Form {
            Section(L10n.Settings.appearance) {
                Picker(L10n.Settings.appearance, selection: $selectedAppearance) {
                    ForEach(AppearanceMode.allCases, id: \.self) { mode in
                        Text(mode.title).tag(mode)
                    }
                }
                .pickerStyle(.segmented)
            }

            Section(L10n.Settings.language) {
                Picker(L10n.Settings.language, selection: $appLanguage) {
                    ForEach(AppLanguage.allCases) { lang in
                        HStack {
                            if lang == .system {
                                Image(systemName: "globe")
                            } else {
                                Text(lang.icon)
                            }
                            Text(lang.displayName)
                        }
                        .tag(lang.rawValue)
                    }
                }
                .pickerStyle(.menu)
            }

            Section(L10n.Settings.notifications) {
                Toggle(L10n.Settings.notifications, isOn: $notificationsEnabled)
                Toggle(L10n.Settings.sound, isOn: $soundEnabled)
                Toggle(L10n.Settings.haptics, isOn: $hapticEnabled)
            }
        }
        .formStyle(.grouped)
        .padding()
    }

    // MARK: - Relay

    private var relayTab: some View {
        Form {
            Section("Relay endpoint") {
                TextField("Base URL", text: $relayBaseURL)
                TextField("Tenant ID", text: $relayTenantId)
            }
            Section("Credentials") {
                TextField("Email", text: $relayEmail)
                SecureField("Password", text: $relayPassword)
            }
            Section {
                Text("Changes take effect the next time you launch the app or open a new conversation.")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
        .formStyle(.grouped)
        .padding()
    }

    // MARK: - Data

    private var dataTab: some View {
        Form {
            Section(L10n.Settings.data) {
                LabeledContent(L10n.Settings.conversations, value: "\(chatService.conversations.count)")
                LabeledContent(L10n.Settings.agents, value: "\(chatService.agents.count)")
            }
            Section {
                Button(role: .destructive) {
                    showDeleteAlert = true
                } label: {
                    Label(L10n.Settings.deleteAllConversations, systemImage: "trash")
                }
            }
        }
        .formStyle(.grouped)
        .padding()
    }

    // MARK: - About

    private var aboutTab: some View {
        VStack(spacing: 16) {
            Image(systemName: "bubble.left.and.bubble.right.fill")
                .font(.system(size: 56))
                .foregroundColor(.accentColor)
            Text(L10n.General.appName)
                .font(.title)
                .fontWeight(.bold)
            Text(L10n.Settings.appSubtitle)
                .font(.subheadline)
                .foregroundColor(.secondary)
            Divider().padding(.horizontal, 60)
            VStack(spacing: 6) {
                LabeledContent(L10n.Settings.version, value: "1.0.0")
                LabeledContent(L10n.Settings.build, value: "1")
            }
            .padding(.horizontal, 60)
            Spacer()
        }
        .padding()
    }
}

// MARK: - Appearance Mode

enum AppearanceMode: String, CaseIterable {
    case system
    case light
    case dark

    var title: String {
        switch self {
        case .system: return L10n.Appearance.system
        case .light: return L10n.Appearance.light
        case .dark: return L10n.Appearance.dark
        }
    }

    var icon: String {
        switch self {
        case .system: return "circle.lefthalf.filled"
        case .light: return "sun.max.fill"
        case .dark: return "moon.fill"
        }
    }

    var colorScheme: ColorScheme? {
        switch self {
        case .system: return nil
        case .light: return .light
        case .dark: return .dark
        }
    }
}
