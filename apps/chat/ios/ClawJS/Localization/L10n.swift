import Foundation

// MARK: - Localization

/// Type-safe localization accessors.
/// All user-facing strings are centralized here for easy maintenance.
/// Usage: `L10n.General.search` or `L10n.Settings.appearance`
///
/// Supports live language switching via `appLanguage` UserDefaults key.
/// When empty, follows the system language.
enum L10n {

    /// Returns the bundle for the currently selected language.
    /// Falls back to Bundle.main (system language) when no override is set.
    static var bundle: Bundle {
        let language = UserDefaults.standard.string(forKey: "appLanguage") ?? ""
        guard !language.isEmpty,
              let path = Bundle.main.path(forResource: language, ofType: "lproj"),
              let b = Bundle(path: path) else {
            return .main
        }
        return b
    }

    private static func tr(_ key: String, _ fallback: String) -> String {
        NSLocalizedString(key, bundle: bundle, value: fallback, comment: "")
    }

    private static func tr(_ key: String, _ fallback: String, _ args: CVarArg...) -> String {
        String(format: NSLocalizedString(key, bundle: bundle, value: fallback, comment: ""), arguments: args)
    }

    // MARK: - General

    enum General {
        static var appName: String { tr("general.app_name", "ClawJS") }
        static var chat: String { tr("general.chat", "Chat") }
        static var search: String { tr("general.search", "Search") }
        static var delete: String { tr("general.delete", "Delete") }
        static var cancel: String { tr("general.cancel", "Cancel") }
        static var create: String { tr("general.create", "Create") }
        static var close: String { tr("general.close", "Close") }
        static var chats: String { tr("general.chats", "Chats") }
        static var documents: String { tr("general.documents", "Documents") }
    }

    // MARK: - Home

    enum Home {
        static var projects: String { tr("home.projects", "Projects") }
        static var conversations: String { tr("home.conversations", "Conversations") }
        static var seeAll: String { tr("home.see_all", "See all") }
        static var allProjects: String { tr("home.all_projects", "All Projects") }
        static var newChat: String { tr("home.new_chat", "New Chat") }
        static var selectAgent: String { tr("home.select_agent", "Select an agent to chat with") }
    }

    // MARK: - Chat

    enum Chat {
        static var thinking: String { tr("chat.thinking", "Thinking") }
        static var messagePlaceholder: String { tr("chat.message_placeholder", "Message") }
        static var waiting: String { tr("chat.waiting", "Waiting...") }

        static func sendMessageTo(_ name: String) -> String {
            tr("chat.send_message_to", "Send a message to %@...", name)
        }
    }

    // MARK: - Agent

    enum Agent {
        static var newAgent: String { tr("agent.new_agent", "New Agent") }
        static var createAgent: String { tr("agent.create_agent", "Create Agent") }
        static var noConversations: String { tr("agent.no_conversations", "No conversations") }
        static var customAgent: String { tr("agent.custom_agent", "Custom agent") }

        static func startConversationWith(_ name: String) -> String {
            tr("agent.start_conversation_with", "Start a conversation with %@", name)
        }
    }

    // MARK: - Agent Form

    enum AgentForm {
        static var name: String { tr("agent_form.name", "Name") }
        static var namePlaceholder: String { tr("agent_form.name_placeholder", "E.g.: Marketing, Legal, Finance...") }
        static var role: String { tr("agent_form.role", "Role") }
        static var rolePlaceholder: String { tr("agent_form.role_placeholder", "E.g.: Content Writer, Analyst...") }
        static var description: String { tr("agent_form.description", "Description") }
        static var descriptionPlaceholder: String { tr("agent_form.description_placeholder", "What does this agent do...") }
    }

    // MARK: - Project

    enum Project {
        static var noConversations: String { tr("project.no_conversations", "No conversations") }

        static func startConversationIn(_ name: String) -> String {
            tr("project.start_conversation_in", "Start a conversation in %@", name)
        }
    }

    // MARK: - Settings

    enum Settings {
        static var title: String { tr("settings.title", "Settings") }
        static var appearance: String { tr("settings.appearance", "Appearance") }
        static var language: String { tr("settings.language", "Language") }
        static var languageSystem: String { tr("settings.language_system", "System Default") }
        static var notifications: String { tr("settings.notifications", "Notifications") }
        static var sound: String { tr("settings.sound", "Sound") }
        static var haptics: String { tr("settings.haptics", "Haptics") }
        static var data: String { tr("settings.data", "Data") }
        static var conversations: String { tr("settings.conversations", "Conversations") }
        static var agents: String { tr("settings.agents", "Agents") }
        static var deleteAllConversations: String { tr("settings.delete_all_conversations", "Delete All Conversations") }
        static var deleteAllAlert: String { tr("settings.delete_all_alert", "This will permanently delete all conversations. This action cannot be undone.") }
        static var about: String { tr("settings.about", "About") }
        static var version: String { tr("settings.version", "Version") }
        static var build: String { tr("settings.build", "Build") }
        static var appSubtitle: String { tr("settings.app_subtitle", "ClawJS - AI Chat Assistant") }
    }

    // MARK: - Appearance

    enum Appearance {
        static var system: String { tr("appearance.system", "System") }
        static var light: String { tr("appearance.light", "Light") }
        static var dark: String { tr("appearance.dark", "Dark") }
    }
}

// MARK: - App Language

enum AppLanguage: String, CaseIterable, Identifiable {
    case system = ""
    case en
    case es
    case fr
    case de
    case it
    case ptBR = "pt-BR"
    case ja
    case ko
    case zhHans = "zh-Hans"
    case ar

    var id: String { rawValue }

    /// Display name in the language's own script
    var displayName: String {
        switch self {
        case .system: return L10n.Settings.languageSystem
        case .en: return "English"
        case .es: return "Espanol"
        case .fr: return "Francais"
        case .de: return "Deutsch"
        case .it: return "Italiano"
        case .ptBR: return "Portugues (Brasil)"
        case .ja: return "日本語"
        case .ko: return "한국어"
        case .zhHans: return "简体中文"
        case .ar: return "العربية"
        }
    }

    var icon: String {
        switch self {
        case .system: return "globe"
        case .en: return "🇺🇸"
        case .es: return "🇪🇸"
        case .fr: return "🇫🇷"
        case .de: return "🇩🇪"
        case .it: return "🇮🇹"
        case .ptBR: return "🇧🇷"
        case .ja: return "🇯🇵"
        case .ko: return "🇰🇷"
        case .zhHans: return "🇨🇳"
        case .ar: return "🇸🇦"
        }
    }
}
