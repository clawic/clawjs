package com.clawjs.chat.data.mock

import com.clawjs.chat.data.model.Agent
import com.clawjs.chat.data.model.Conversation
import com.clawjs.chat.data.model.ConversationStatus
import com.clawjs.chat.data.model.Message
import com.clawjs.chat.data.model.MessageRole
import com.clawjs.chat.data.model.Project
import com.clawjs.chat.data.model.Topic
import java.util.UUID
import kotlin.time.Duration.Companion.days
import kotlin.time.Duration.Companion.hours
import kotlin.time.Duration.Companion.minutes

/**
 * Offline fallback. Mirrors `apps/chat/ios/ClawJS/Services/MockData.swift`
 * (12 agents, 16 projects, 30 topics, ~35 sample conversations). The iOS
 * version hardcodes UUIDs for agents; we follow the same pattern so the
 * offline view matches.
 */
object MockData {
    private val now: Long = System.currentTimeMillis()
    private fun ago(d: Long) = now - d

    val projects: List<Project> = listOf(
        p("Creator Studio", 90.days.inWholeMilliseconds),
        p("Team Chat App", 75.days.inWholeMilliseconds),
        p("Agentic Engineering", 60.days.inWholeMilliseconds),
        p("ClawJS", 50.days.inWholeMilliseconds),
        p("Landing Page", 45.days.inWholeMilliseconds),
        p("E-commerce App", 40.days.inWholeMilliseconds),
        p("API Gateway", 35.days.inWholeMilliseconds),
        p("Dashboard Analytics", 30.days.inWholeMilliseconds),
        p("Fitness Tracker", 28.days.inWholeMilliseconds),
        p("Recipe Finder", 25.days.inWholeMilliseconds),
        p("Music Streaming MVP", 20.days.inWholeMilliseconds),
        p("Podcast App", 18.days.inWholeMilliseconds),
        p("Real Estate Portal", 14.days.inWholeMilliseconds),
        p("Inventory Management", 10.days.inWholeMilliseconds),
        p("Chat SDK Open Source", 7.days.inWholeMilliseconds),
        p("AI Photo Editor", 3.days.inWholeMilliseconds),
    )

    val topics: List<Topic> = listOf(
        t(projects[0], "Content strategy"),
        t(projects[0], "Social media calendar"),
        t(projects[0], "Visual branding"),
        t(projects[0], "Weekly newsletter"),
        t(projects[1], "End-to-end encryption"),
        t(projects[1], "Groups and channels"),
        t(projects[2], "Tool calling framework"),
        t(projects[2], "Memory persistence"),
        t(projects[3], "Authentication"),
        t(projects[3], "Performance"),
        t(projects[3], "Plugin system"),
        t(projects[4], "Hero section A/B test"),
        t(projects[4], "SEO on-page"),
        t(projects[5], "Checkout flow"),
        t(projects[5], "Product catalog"),
        t(projects[5], "Payment integration"),
        t(projects[6], "CI/CD"),
        t(projects[6], "Rate limiting"),
        t(projects[6], "Service mesh"),
        t(projects[7], "Key metrics"),
        t(projects[7], "Dashboards"),
        t(projects[8], "HealthKit integration"),
        t(projects[8], "Workout templates"),
        t(projects[9], "Ingredient parser"),
        t(projects[9], "Meal planner"),
        t(projects[10], "Audio player engine"),
        t(projects[12], "Map integration"),
        t(projects[12], "Mortgage calculator"),
        t(projects[14], "WebSocket transport"),
        t(projects[15], "Style transfer models"),
    )

    val agents: List<Agent> = listOf(
        a("00000000-0000-0000-0000-000000000010", "DevOps", "DV", "server.rack",
            "Code Assistant", "Helps you write, debug, and refactor code"),
        a("00000000-0000-0000-0000-000000000020", "SEO", "SE", "chart.line.uptrend.xyaxis",
            "Creative Writer", "Writes stories, copy, and creative content"),
        a("00000000-0000-0000-0000-000000000030", "Analyst", "AN", "chart.pie",
            "Data Analyst", "Analyzes data, creates charts, finds insights"),
        a("00000000-0000-0000-0000-000000000040", "Planner", "PL", "map",
            "Travel Planner", "Plans trips, finds flights, recommends places"),
        a("00000000-0000-0000-0000-000000000050", "Tutor", "TU", "text.book.closed",
            "Language Tutor", "Teaches languages with exercises and conversation"),
        a("00000000-0000-0000-0000-000000000060", "Designer", "DS", "paintbrush",
            "UI/UX Designer", "Creates wireframes, critiques designs, suggests improvements"),
        a("00000000-0000-0000-0000-000000000070", "Legal", "LG", "scale.3d",
            "Legal Advisor", "Reviews contracts, explains regulations, drafts terms"),
        a("00000000-0000-0000-0000-000000000080", "Coach", "CO", "figure.run",
            "Fitness Coach", "Creates workout plans, tracks progress, gives nutrition tips"),
        a("00000000-0000-0000-0000-000000000090", "PM", "PM", "list.clipboard",
            "Product Manager", "Prioritizes features, writes specs, runs sprints"),
        a("00000000-0000-0000-0000-0000000000A0", "Marketer", "MK", "megaphone",
            "Marketing Strategist", "Plans campaigns, analyzes funnels, optimizes ad spend"),
        a("00000000-0000-0000-0000-0000000000B0", "DBA", "DB", "cylinder",
            "Database Expert", "Optimizes queries, designs schemas, manages migrations"),
        a("00000000-0000-0000-0000-0000000000C0", "SecOps", "SC", "lock.shield",
            "Security Specialist", "Audits code for vulnerabilities, sets up auth flows, hardens infra"),
    )

    fun generateConversations(): List<Conversation> {
        val conversations = mutableListOf<Conversation>()
        // Small sampling of illustrative conversations, enough for the offline
        // fallback to not look empty. Not a full port of the iOS mock data.
        conversations += Conversation(
            id = UUID.randomUUID(),
            agentId = agents[0].id,
            projectId = projects[3].id,
            topicId = topics[8].id,
            title = "Refactor auth module",
            messages = listOf(
                msg(MessageRole.User, "Can you help me refactor the authentication module?", 10.minutes.inWholeMilliseconds),
                msg(MessageRole.Agent, "Sure! Share the current structure and I'll suggest a cleaner architecture.", 9.minutes.inWholeMilliseconds),
                msg(MessageRole.User, "Here's the main file. 500 lines, both OAuth and JWT.", 2.minutes.inWholeMilliseconds),
            ),
            status = ConversationStatus.Thinking,
            createdAt = ago(15.minutes.inWholeMilliseconds),
        )
        conversations += Conversation(
            id = UUID.randomUUID(),
            agentId = agents[0].id,
            projectId = projects[3].id,
            topicId = topics[9].id,
            title = "Fix memory leak",
            messages = listOf(
                msg(MessageRole.User, "I think there's a memory leak in the image cache.", 3.hours.inWholeMilliseconds),
                msg(MessageRole.Agent, "Found it. The cache isn't releasing references when views deallocate. Here's the fix.", 2.hours.inWholeMilliseconds),
            ),
            status = ConversationStatus.Unread,
            createdAt = ago(4.hours.inWholeMilliseconds),
        )
        conversations += Conversation(
            id = UUID.randomUUID(),
            agentId = agents[5].id,
            projectId = projects[4].id,
            topicId = topics[11].id,
            title = "Hero section variants",
            messages = listOf(
                msg(MessageRole.User, "Need 3 hero copy variants for the A/B test.", 1.days.inWholeMilliseconds),
                msg(MessageRole.Agent, "Here are three variants targeting different value props.", 1.days.inWholeMilliseconds),
            ),
            status = ConversationStatus.Read,
            createdAt = ago(2.days.inWholeMilliseconds),
        )
        conversations += Conversation(
            id = UUID.randomUUID(),
            agentId = agents[2].id,
            projectId = projects[7].id,
            topicId = topics[19].id,
            title = "Weekly active dashboard",
            messages = listOf(
                msg(MessageRole.User, "Can you build a WAU trend chart for the last 8 weeks?", 5.hours.inWholeMilliseconds),
                msg(MessageRole.Agent, "Here's a chart with weekly rollups and a 4-week moving average.", 4.hours.inWholeMilliseconds),
            ),
            status = ConversationStatus.Read,
            createdAt = ago(6.hours.inWholeMilliseconds),
        )
        return conversations
    }

    // ---- helpers ------------------------------------------------------------

    private fun p(name: String, daysAgoMs: Long) =
        Project(id = UUID.randomUUID(), name = name, createdAt = ago(daysAgoMs))

    private fun t(project: Project, name: String) = Topic(
        id = UUID.randomUUID(),
        projectId = project.id,
        name = name,
        createdAt = now,
    )

    private fun a(
        uuid: String, name: String, initials: String, icon: String,
        role: String, description: String,
    ) = Agent(
        id = UUID.fromString(uuid),
        name = name,
        initials = initials,
        icon = icon,
        role = role,
        description = description,
    )

    private fun msg(role: MessageRole, text: String, agoMs: Long) = Message(
        id = UUID.randomUUID(),
        role = role,
        text = text,
        timestamp = ago(agoMs),
    )
}
