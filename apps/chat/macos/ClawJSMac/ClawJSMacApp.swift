import SwiftUI

@main
struct ClawJSMacApp: App {
    @StateObject private var chatService = ChatService()
    @AppStorage("selectedAppearance") private var selectedAppearance: AppearanceMode = .system
    @AppStorage("appLanguage") private var appLanguage = ""

    var body: some Scene {
        WindowGroup(L10n.General.appName) {
            RootSplitView()
                .environmentObject(chatService)
                .preferredColorScheme(selectedAppearance.colorScheme)
                .frame(minWidth: 960, minHeight: 640)
                .id(appLanguage)
        }
        .defaultSize(width: 1280, height: 820)
        .defaultPosition(.center)
        .windowResizability(.contentMinSize)
        .windowStyle(.titleBar)
        .windowToolbarStyle(.unified)
        .commands {
            CommandGroup(replacing: .newItem) {
                Button(L10n.Home.newChat) {
                    NotificationCenter.default.post(name: .clawNewChatRequested, object: nil)
                }
                .keyboardShortcut("n", modifiers: .command)
            }
        }

        Settings {
            SettingsView()
                .environmentObject(chatService)
                .preferredColorScheme(selectedAppearance.colorScheme)
                .frame(width: 520, height: 620)
                .id(appLanguage)
        }
    }
}

extension Notification.Name {
    static let clawNewChatRequested = Notification.Name("clawjs.mac.newChatRequested")
}
