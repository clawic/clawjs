package com.clawjs.chat.data.model

import java.util.UUID

// 1:1 port of apps/chat/ios/ClawJS/Models/Models.swift. Uses java.util.UUID as
// the local id type (matches Swift's UUID). Remote IDs are Strings and live
// exclusively inside ChatRepository's UUID <-> String maps.

data class Project(
    val id: UUID,
    val name: String,
    val createdAt: Long, // epoch millis
)

data class Topic(
    val id: UUID,
    val projectId: UUID,
    val name: String,
    val createdAt: Long,
)

data class Agent(
    val id: UUID,
    val name: String,
    val initials: String,
    val icon: String,     // SF-symbol-style key, mapped by IconMap
    val role: String,
    val description: String,
)

enum class ConversationStatus(val rank: Int) : Comparable<ConversationStatus> {
    Thinking(0),
    Streaming(1),
    Unread(2),
    Read(3);
}

enum class MessageRole { User, Agent }

data class Message(
    val id: UUID,
    val role: MessageRole,
    val text: String,
    val timestamp: Long,
)

data class Conversation(
    val id: UUID,
    val agentId: UUID,
    val projectId: UUID?,
    val topicId: UUID?,
    val title: String,
    val messages: List<Message>,
    val status: ConversationStatus,
    val createdAt: Long,
) {
    val lastMessage: Message? get() = messages.lastOrNull()
    val lastMessagePreview: String get() = lastMessage?.text ?: "New conversation"
    val lastActivityTime: Long get() = lastMessage?.timestamp ?: createdAt
}

// ---- Settings-related enums -------------------------------------------------

enum class AppearanceMode(val key: String) {
    System("system"),
    Light("light"),
    Dark("dark");

    companion object {
        fun fromKey(key: String): AppearanceMode =
            entries.firstOrNull { it.key == key } ?: System
    }
}

enum class AppLanguage(val tag: String, val displayName: String) {
    System("", "System Default"),
    English("en", "English"),
    Spanish("es", "Espanol"),
    French("fr", "Francais"),
    German("de", "Deutsch"),
    Italian("it", "Italiano"),
    PortugueseBrazil("pt-BR", "Portugues (Brasil)"),
    Japanese("ja", "日本語"),
    Korean("ko", "한국어"),
    ChineseSimplified("zh-Hans", "简体中文"),
    Arabic("ar", "العربية");

    companion object {
        fun fromTag(tag: String): AppLanguage =
            entries.firstOrNull { it.tag == tag } ?: System
    }
}
