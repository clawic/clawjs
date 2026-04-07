import Foundation

// MARK: - Project

struct Project: Identifiable, Hashable {
    let id: UUID
    let name: String
    let createdAt: Date
}

// MARK: - Topic

struct Topic: Identifiable, Hashable {
    let id: UUID
    let projectId: UUID
    let name: String
    let createdAt: Date
}

// MARK: - Agent

struct Agent: Identifiable, Hashable {
    let id: UUID
    let name: String
    let initials: String
    let icon: String
    let role: String
    let description: String
}

// MARK: - Conversation Status

enum ConversationStatus: Int, Comparable, Equatable {
    case thinking = 0
    case streaming = 1
    case unread = 2
    case read = 3

    static func < (lhs: ConversationStatus, rhs: ConversationStatus) -> Bool {
        lhs.rawValue < rhs.rawValue
    }
}

// MARK: - Message

enum MessageRole: Equatable {
    case user
    case agent
}

struct Message: Identifiable, Equatable {
    let id: UUID
    let role: MessageRole
    let text: String
    let timestamp: Date
}

// MARK: - Conversation

struct Conversation: Identifiable {
    let id: UUID
    var agentId: UUID
    var projectId: UUID?
    var topicId: UUID?
    var title: String
    var messages: [Message]
    var status: ConversationStatus
    let createdAt: Date

    var lastMessage: Message? {
        messages.last
    }

    var lastMessagePreview: String {
        lastMessage?.text ?? "New conversation"
    }

    var lastActivityTime: Date {
        lastMessage?.timestamp ?? createdAt
    }
}
