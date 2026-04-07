import Foundation

enum MockData {
    // MARK: - Projects (16)

    static let projects: [Project] = [
        Project(id: UUID(), name: "Creator Studio", createdAt: date(ago: .day, value: -90, from: .now)),
        Project(id: UUID(), name: "Team Chat App", createdAt: date(ago: .day, value: -75, from: .now)),
        Project(id: UUID(), name: "Agentic Engineering", createdAt: date(ago: .day, value: -60, from: .now)),
        Project(id: UUID(), name: "ClawJS", createdAt: date(ago: .day, value: -50, from: .now)),
        Project(id: UUID(), name: "Landing Page", createdAt: date(ago: .day, value: -45, from: .now)),
        Project(id: UUID(), name: "E-commerce App", createdAt: date(ago: .day, value: -40, from: .now)),
        Project(id: UUID(), name: "API Gateway", createdAt: date(ago: .day, value: -35, from: .now)),
        Project(id: UUID(), name: "Dashboard Analytics", createdAt: date(ago: .day, value: -30, from: .now)),
        Project(id: UUID(), name: "Fitness Tracker", createdAt: date(ago: .day, value: -28, from: .now)),
        Project(id: UUID(), name: "Recipe Finder", createdAt: date(ago: .day, value: -25, from: .now)),
        Project(id: UUID(), name: "Music Streaming MVP", createdAt: date(ago: .day, value: -20, from: .now)),
        Project(id: UUID(), name: "Podcast App", createdAt: date(ago: .day, value: -18, from: .now)),
        Project(id: UUID(), name: "Real Estate Portal", createdAt: date(ago: .day, value: -14, from: .now)),
        Project(id: UUID(), name: "Inventory Management", createdAt: date(ago: .day, value: -10, from: .now)),
        Project(id: UUID(), name: "Chat SDK Open Source", createdAt: date(ago: .day, value: -7, from: .now)),
        Project(id: UUID(), name: "AI Photo Editor", createdAt: date(ago: .day, value: -3, from: .now)),
    ]

    // MARK: - Topics (30)

    static let topics: [Topic] = [
        // Creator Studio (projects[0])
        Topic(id: UUID(), projectId: projects[0].id, name: "Content strategy", createdAt: .now),
        Topic(id: UUID(), projectId: projects[0].id, name: "Social media calendar", createdAt: .now),
        Topic(id: UUID(), projectId: projects[0].id, name: "Visual branding", createdAt: .now),
        Topic(id: UUID(), projectId: projects[0].id, name: "Weekly newsletter", createdAt: .now),

        // Team Chat App (projects[1])
        Topic(id: UUID(), projectId: projects[1].id, name: "End-to-end encryption", createdAt: .now),
        Topic(id: UUID(), projectId: projects[1].id, name: "Groups and channels", createdAt: .now),

        // Agentic Engineering (projects[2])
        Topic(id: UUID(), projectId: projects[2].id, name: "Tool calling framework", createdAt: .now),
        Topic(id: UUID(), projectId: projects[2].id, name: "Memory persistence", createdAt: .now),

        // ClawJS (projects[3])
        Topic(id: UUID(), projectId: projects[3].id, name: "Authentication", createdAt: .now),
        Topic(id: UUID(), projectId: projects[3].id, name: "Performance", createdAt: .now),
        Topic(id: UUID(), projectId: projects[3].id, name: "Plugin system", createdAt: .now),

        // Landing Page (projects[4])
        Topic(id: UUID(), projectId: projects[4].id, name: "Hero section A/B test", createdAt: .now),
        Topic(id: UUID(), projectId: projects[4].id, name: "SEO on-page", createdAt: .now),

        // E-commerce App (projects[5])
        Topic(id: UUID(), projectId: projects[5].id, name: "Checkout flow", createdAt: .now),
        Topic(id: UUID(), projectId: projects[5].id, name: "Product catalog", createdAt: .now),
        Topic(id: UUID(), projectId: projects[5].id, name: "Payment integration", createdAt: .now),

        // API Gateway (projects[6])
        Topic(id: UUID(), projectId: projects[6].id, name: "CI/CD", createdAt: .now),
        Topic(id: UUID(), projectId: projects[6].id, name: "Rate limiting", createdAt: .now),
        Topic(id: UUID(), projectId: projects[6].id, name: "Service mesh", createdAt: .now),

        // Dashboard Analytics (projects[7])
        Topic(id: UUID(), projectId: projects[7].id, name: "Key metrics", createdAt: .now),
        Topic(id: UUID(), projectId: projects[7].id, name: "Dashboards", createdAt: .now),

        // Fitness Tracker (projects[8])
        Topic(id: UUID(), projectId: projects[8].id, name: "HealthKit integration", createdAt: .now),
        Topic(id: UUID(), projectId: projects[8].id, name: "Workout templates", createdAt: .now),

        // Recipe Finder (projects[9])
        Topic(id: UUID(), projectId: projects[9].id, name: "Ingredient parser", createdAt: .now),
        Topic(id: UUID(), projectId: projects[9].id, name: "Meal planner", createdAt: .now),

        // Music Streaming (projects[10])
        Topic(id: UUID(), projectId: projects[10].id, name: "Audio player engine", createdAt: .now),

        // Real Estate Portal (projects[12])
        Topic(id: UUID(), projectId: projects[12].id, name: "Map integration", createdAt: .now),
        Topic(id: UUID(), projectId: projects[12].id, name: "Mortgage calculator", createdAt: .now),

        // Chat SDK (projects[14])
        Topic(id: UUID(), projectId: projects[14].id, name: "WebSocket transport", createdAt: .now),

        // AI Photo Editor (projects[15])
        Topic(id: UUID(), projectId: projects[15].id, name: "Style transfer models", createdAt: .now),
    ]

    // MARK: - Agents (12)

    static let agents: [Agent] = [
        Agent(id: UUID(uuidString: "00000000-0000-0000-0000-000000000010")!,
              name: "DevOps", initials: "DV", icon: "server.rack",
              role: "Code Assistant",
              description: "Helps you write, debug, and refactor code"),
        Agent(id: UUID(uuidString: "00000000-0000-0000-0000-000000000020")!,
              name: "SEO", initials: "SE", icon: "chart.line.uptrend.xyaxis",
              role: "Creative Writer",
              description: "Writes stories, copy, and creative content"),
        Agent(id: UUID(uuidString: "00000000-0000-0000-0000-000000000030")!,
              name: "Analyst", initials: "AN", icon: "chart.pie",
              role: "Data Analyst",
              description: "Analyzes data, creates charts, finds insights"),
        Agent(id: UUID(uuidString: "00000000-0000-0000-0000-000000000040")!,
              name: "Planner", initials: "PL", icon: "map",
              role: "Travel Planner",
              description: "Plans trips, finds flights, recommends places"),
        Agent(id: UUID(uuidString: "00000000-0000-0000-0000-000000000050")!,
              name: "Tutor", initials: "TU", icon: "text.book.closed",
              role: "Language Tutor",
              description: "Teaches languages with exercises and conversation"),
        Agent(id: UUID(uuidString: "00000000-0000-0000-0000-000000000060")!,
              name: "Designer", initials: "DS", icon: "paintbrush",
              role: "UI/UX Designer",
              description: "Creates wireframes, critiques designs, suggests improvements"),
        Agent(id: UUID(uuidString: "00000000-0000-0000-0000-000000000070")!,
              name: "Legal", initials: "LG", icon: "scale.3d",
              role: "Legal Advisor",
              description: "Reviews contracts, explains regulations, drafts terms"),
        Agent(id: UUID(uuidString: "00000000-0000-0000-0000-000000000080")!,
              name: "Coach", initials: "CO", icon: "figure.run",
              role: "Fitness Coach",
              description: "Creates workout plans, tracks progress, gives nutrition tips"),
        Agent(id: UUID(uuidString: "00000000-0000-0000-0000-000000000090")!,
              name: "PM", initials: "PM", icon: "list.clipboard",
              role: "Product Manager",
              description: "Prioritizes features, writes specs, runs sprints"),
        Agent(id: UUID(uuidString: "00000000-0000-0000-0000-0000000000A0")!,
              name: "Marketer", initials: "MK", icon: "megaphone",
              role: "Marketing Strategist",
              description: "Plans campaigns, analyzes funnels, optimizes ad spend"),
        Agent(id: UUID(uuidString: "00000000-0000-0000-0000-0000000000B0")!,
              name: "DBA", initials: "DB", icon: "cylinder",
              role: "Database Expert",
              description: "Optimizes queries, designs schemas, manages migrations"),
        Agent(id: UUID(uuidString: "00000000-0000-0000-0000-0000000000C0")!,
              name: "SecOps", initials: "SC", icon: "lock.shield",
              role: "Security Specialist",
              description: "Audits code for vulnerabilities, sets up auth flows, hardens infra"),
    ]

    // MARK: - Conversations (35+)

    static func generateConversations() -> [Conversation] {
        let now = Date()

        return [

            // ── DevOps (agents[0]) ─────────────────────────────

            Conversation(
                id: UUID(), agentId: agents[0].id,
                projectId: projects[3].id,
                topicId: topics[8].id,
                title: "Refactor auth module",
                messages: [
                    msg(.user, "Can you help me refactor the authentication module? It's getting too complex", ago: .minute, value: -10, from: now),
                    msg(.agent, "Sure! Can you share the current structure? I'll suggest a cleaner architecture", ago: .minute, value: -9, from: now),
                    msg(.user, "Here's the main file. It has 500 lines and handles both OAuth and JWT", ago: .minute, value: -2, from: now),
                ],
                status: .thinking, createdAt: date(ago: .minute, value: -15, from: now)
            ),
            Conversation(
                id: UUID(), agentId: agents[0].id,
                projectId: projects[3].id,
                topicId: topics[9].id,
                title: "Fix memory leak",
                messages: [
                    msg(.user, "I think there's a memory leak in the image cache", ago: .hour, value: -3, from: now),
                    msg(.agent, "I've found the issue. The cache isn't releasing references when views are deallocated. Here's the fix with a weak reference pattern.", ago: .hour, value: -2, from: now),
                ],
                status: .unread, createdAt: date(ago: .hour, value: -4, from: now)
            ),
            Conversation(
                id: UUID(), agentId: agents[0].id,
                projectId: projects[6].id,
                topicId: topics[16].id,
                title: "Setup CI pipeline",
                messages: [
                    msg(.user, "Help me set up GitHub Actions for this Swift project", ago: .day, value: -1, from: now),
                    msg(.agent, "Here's a complete workflow file with build, test, and lint stages. I've included caching for SPM dependencies.", ago: .day, value: -1, from: now),
                    msg(.user, "Perfect, that works great", ago: .day, value: -1, from: now),
                ],
                status: .read, createdAt: date(ago: .day, value: -2, from: now)
            ),
            Conversation(
                id: UUID(), agentId: agents[0].id,
                projectId: projects[3].id,
                topicId: topics[10].id,
                title: "Plugin architecture design",
                messages: [
                    msg(.user, "I want to make ClawJS extensible with plugins. Ideas?", ago: .hour, value: -6, from: now),
                    msg(.agent, "A middleware-style approach works well. Define a PluginProtocol with lifecycle hooks: onInit, onRequest, onResponse, onError. Plugins register through a central PluginManager.", ago: .hour, value: -5, from: now),
                    msg(.user, "Can you show me the protocol definition?", ago: .hour, value: -5, from: now),
                    msg(.agent, "Here it is. I've also added a priority system so plugins can control execution order.", ago: .hour, value: -4, from: now),
                    msg(.user, "What about async plugins?", ago: .hour, value: -3, from: now),
                    msg(.agent, "Good call. I've updated the protocol to use async/await. Each hook returns a Task that the manager awaits in sequence.", ago: .hour, value: -2, from: now),
                ],
                status: .read, createdAt: date(ago: .hour, value: -7, from: now)
            ),
            Conversation(
                id: UUID(), agentId: agents[0].id,
                projectId: projects[14].id,
                topicId: topics[28].id,
                title: "WebSocket reconnection logic",
                messages: [
                    msg(.user, "Our WebSocket drops and never reconnects. Can you look at this?", ago: .minute, value: -20, from: now),
                    msg(.agent, "The issue is you're not implementing exponential backoff. After the first failure, you retry immediately and get rate-limited. Here's a reconnection manager with jitter.", ago: .minute, value: -18, from: now),
                    msg(.user, "Should I use URLSessionWebSocketTask or Starscream?", ago: .minute, value: -15, from: now),
                    msg(.agent, "URLSessionWebSocketTask is fine for most cases and avoids the dependency. Starscream gives you more control over ping/pong. For a chat SDK, I'd go with Starscream.", ago: .minute, value: -12, from: now),
                ],
                status: .unread, createdAt: date(ago: .minute, value: -25, from: now)
            ),
            Conversation(
                id: UUID(), agentId: agents[0].id,
                projectId: projects[5].id,
                topicId: topics[15].id,
                title: "Stripe integration crash",
                messages: [
                    msg(.user, "The app crashes when users confirm payment. Here's the crash log", ago: .minute, value: -3, from: now),
                ],
                status: .thinking, createdAt: date(ago: .minute, value: -5, from: now)
            ),

            // ── SEO / Creative Writer (agents[1]) ─────────────

            Conversation(
                id: UUID(), agentId: agents[1].id,
                projectId: projects[0].id,
                topicId: topics[0].id,
                title: "Blog post about AI",
                messages: [
                    msg(.user, "Write me a blog post about how AI is changing mobile development", ago: .hour, value: -1, from: now),
                    msg(.agent, "Here's a draft with 3 sections: AI-powered design tools, automated testing, and intelligent code completion.", ago: .minute, value: -30, from: now),
                ],
                status: .unread, createdAt: date(ago: .hour, value: -2, from: now)
            ),
            Conversation(
                id: UUID(), agentId: agents[1].id,
                projectId: projects[4].id,
                topicId: topics[11].id,
                title: "Product descriptions",
                messages: [
                    msg(.user, "I need 5 product descriptions for our new app features", ago: .day, value: -2, from: now),
                    msg(.agent, "Done! Each description is 2-3 sentences, highlighting the benefit to the user.", ago: .day, value: -2, from: now),
                    msg(.user, "These are great, thanks!", ago: .day, value: -2, from: now),
                ],
                status: .read, createdAt: date(ago: .day, value: -3, from: now)
            ),
            Conversation(
                id: UUID(), agentId: agents[1].id,
                projectId: projects[0].id,
                topicId: topics[3].id,
                title: "Newsletter intro draft",
                messages: [
                    msg(.user, "Write the intro for this week's newsletter. Topic: why we open-sourced our SDK", ago: .hour, value: -4, from: now),
                    msg(.agent, "Here's a warm, personal intro that hooks with the story of how a community PR inspired the decision. About 150 words.", ago: .hour, value: -3, from: now),
                    msg(.user, "Can you make it shorter? Like 80 words max", ago: .hour, value: -2, from: now),
                    msg(.agent, "Trimmed to 75 words. Kept the community angle but removed the backstory paragraph.", ago: .hour, value: -1, from: now),
                ],
                status: .unread, createdAt: date(ago: .hour, value: -5, from: now)
            ),
            Conversation(
                id: UUID(), agentId: agents[1].id,
                projectId: projects[0].id,
                topicId: topics[1].id,
                title: "Twitter thread ideas",
                messages: [
                    msg(.user, "Give me 10 tweet ideas about developer productivity", ago: .day, value: -5, from: now),
                    msg(.agent, "Here are 10 ideas ranging from hot takes to practical tips. I've marked the 3 most likely to get engagement.", ago: .day, value: -5, from: now),
                    msg(.user, "Love #3 and #7. Expand those into full threads", ago: .day, value: -4, from: now),
                    msg(.agent, "Done. Thread #3 has 8 tweets about time-blocking. Thread #7 has 6 tweets debunking hustle culture myths.", ago: .day, value: -4, from: now),
                ],
                status: .read, createdAt: date(ago: .day, value: -6, from: now)
            ),

            // ── Analyst (agents[2]) ────────────────────────────

            Conversation(
                id: UUID(), agentId: agents[2].id,
                projectId: projects[7].id,
                topicId: topics[19].id,
                title: "Q1 revenue analysis",
                messages: [
                    msg(.user, "Analyze our Q1 revenue data and find the top growth areas", ago: .minute, value: -8, from: now),
                ],
                status: .thinking, createdAt: date(ago: .minute, value: -10, from: now)
            ),
            Conversation(
                id: UUID(), agentId: agents[2].id,
                projectId: projects[7].id,
                topicId: topics[20].id,
                title: "User retention report",
                messages: [
                    msg(.user, "Can you create a retention cohort analysis?", ago: .day, value: -1, from: now),
                    msg(.agent, "Here's the cohort analysis. Key finding: users who complete onboarding in the first session have 3x higher 30-day retention.", ago: .day, value: -1, from: now),
                    msg(.user, "Very insightful. Can you export this as a CSV?", ago: .day, value: -1, from: now),
                    msg(.agent, "CSV exported. I also added a pivot table summary at the top for quick reference.", ago: .hour, value: -20, from: now),
                ],
                status: .read, createdAt: date(ago: .day, value: -3, from: now)
            ),
            Conversation(
                id: UUID(), agentId: agents[2].id,
                projectId: projects[5].id,
                topicId: topics[13].id,
                title: "Checkout funnel drop-off",
                messages: [
                    msg(.user, "Where are we losing users in the checkout funnel?", ago: .hour, value: -8, from: now),
                    msg(.agent, "Biggest drop-off is between cart and payment: 62% abandon. The second biggest is address entry at 28%. Looks like the form is too long.", ago: .hour, value: -7, from: now),
                    msg(.user, "Can you compare with last month?", ago: .hour, value: -6, from: now),
                    msg(.agent, "Compared. The payment step got worse by 8% after the UI change on March 15. I'd suggest reverting that change.", ago: .hour, value: -5, from: now),
                    msg(.user, "Good catch. What about mobile vs desktop?", ago: .hour, value: -4, from: now),
                    msg(.agent, "Mobile drop-off at payment is 71% vs 48% on desktop. The Stripe modal doesn't render well on small screens.", ago: .hour, value: -3, from: now),
                ],
                status: .read, createdAt: date(ago: .hour, value: -10, from: now)
            ),
            Conversation(
                id: UUID(), agentId: agents[2].id,
                projectId: projects[10].id,
                title: "Listening habits report",
                messages: [
                    msg(.user, "What are the most common listening patterns? Peak hours, genres, session length", ago: .day, value: -2, from: now),
                    msg(.agent, "Peak listening: 8-9 AM commute and 6-8 PM wind-down. Top genres: lo-fi (34%), pop (22%), indie (18%). Average session: 47 minutes.", ago: .day, value: -2, from: now),
                ],
                status: .read, createdAt: date(ago: .day, value: -3, from: now)
            ),

            // ── Planner (agents[3]) ────────────────────────────

            Conversation(
                id: UUID(), agentId: agents[3].id,
                title: "Tokyo trip itinerary",
                messages: [
                    msg(.user, "Plan a 7-day trip to Tokyo for 2 people in April", ago: .minute, value: -5, from: now),
                    msg(.user, "Budget is around 3000 EUR. We love food and culture.", ago: .minute, value: -4, from: now),
                ],
                status: .thinking, createdAt: date(ago: .minute, value: -8, from: now)
            ),
            Conversation(
                id: UUID(), agentId: agents[3].id,
                title: "Barcelona restaurants",
                messages: [
                    msg(.user, "Best restaurants in Barcelona for a special dinner?", ago: .hour, value: -5, from: now),
                    msg(.agent, "Here are my top 5 picks with reservations links, price ranges, and what to order.", ago: .hour, value: -4, from: now),
                ],
                status: .unread, createdAt: date(ago: .hour, value: -6, from: now)
            ),
            Conversation(
                id: UUID(), agentId: agents[3].id,
                title: "Flight comparison",
                messages: [
                    msg(.user, "Compare flights Madrid to London next month", ago: .day, value: -4, from: now),
                    msg(.agent, "Found 12 options. Best value: Iberia direct at 89 EUR. Best schedule: BA morning flight at 120 EUR.", ago: .day, value: -4, from: now),
                ],
                status: .read, createdAt: date(ago: .day, value: -5, from: now)
            ),
            Conversation(
                id: UUID(), agentId: agents[3].id,
                title: "Marrakech weekend plan",
                messages: [
                    msg(.user, "Plan a long weekend in Marrakech. We want riads, markets, and food tours", ago: .day, value: -1, from: now),
                    msg(.agent, "3-day itinerary: Day 1 Medina and souks, Day 2 Atlas Mountains day trip, Day 3 food tour and hammam. Riad recommendations included.", ago: .day, value: -1, from: now),
                    msg(.user, "Add a cooking class too", ago: .day, value: -1, from: now),
                    msg(.agent, "Added La Maison Arabe cooking class on Day 2 morning before the mountain trip. Adjusted the schedule.", ago: .hour, value: -22, from: now),
                ],
                status: .read, createdAt: date(ago: .day, value: -2, from: now)
            ),

            // ── Tutor (agents[4]) ──────────────────────────────

            Conversation(
                id: UUID(), agentId: agents[4].id,
                title: "Japanese basics",
                messages: [
                    msg(.user, "Teach me basic Japanese greetings", ago: .hour, value: -2, from: now),
                    msg(.agent, "Let's start with the essentials! Konnichiwa means hello. Here are 8 greetings you'll use daily.", ago: .hour, value: -1, from: now),
                ],
                status: .unread, createdAt: date(ago: .hour, value: -3, from: now)
            ),
            Conversation(
                id: UUID(), agentId: agents[4].id,
                title: "French verb practice",
                messages: [
                    msg(.user, "Quiz me on French irregular verbs", ago: .day, value: -1, from: now),
                    msg(.agent, "Here's a 10-question quiz on the most common irregular verbs.", ago: .day, value: -1, from: now),
                    msg(.user, "1. etre -> je suis, tu es, il est", ago: .day, value: -1, from: now),
                    msg(.agent, "Parfait! 100% correct. Next: conjugate avoir in present.", ago: .day, value: -1, from: now),
                ],
                status: .read, createdAt: date(ago: .day, value: -2, from: now)
            ),
            Conversation(
                id: UUID(), agentId: agents[4].id,
                title: "German cases explained",
                messages: [
                    msg(.user, "I can never remember when to use Akkusativ vs Dativ", ago: .hour, value: -9, from: now),
                    msg(.agent, "Akkusativ answers 'wen/was' (who/what), Dativ answers 'wem' (to whom). Some prepositions force one or the other. Here's a cheat sheet.", ago: .hour, value: -8, from: now),
                    msg(.user, "What about Wechselprapositionen?", ago: .hour, value: -7, from: now),
                    msg(.agent, "Those are the 9 two-way prepositions (an, auf, hinter, in, neben, uber, unter, vor, zwischen). Movement = Akkusativ, location = Dativ. 'Ich gehe in DEN Park' vs 'Ich bin in DEM Park'.", ago: .hour, value: -6, from: now),
                    msg(.user, "That actually makes sense now. Quiz me!", ago: .hour, value: -5, from: now),
                    msg(.agent, "Fill in: 'Die Katze springt auf ___ Tisch' and 'Die Katze sitzt auf ___ Tisch'. Think about movement vs position.", ago: .hour, value: -4, from: now),
                ],
                status: .read, createdAt: date(ago: .hour, value: -10, from: now)
            ),
            Conversation(
                id: UUID(), agentId: agents[4].id,
                title: "Portuguese for travel",
                messages: [
                    msg(.user, "I'm going to Lisbon next week. Teach me survival Portuguese", ago: .minute, value: -40, from: now),
                    msg(.agent, "Let's cover the essentials: greetings, ordering food, asking for directions, and numbers. We'll do 15 minutes on each.", ago: .minute, value: -38, from: now),
                ],
                status: .unread, createdAt: date(ago: .minute, value: -45, from: now)
            ),

            // ── Designer (agents[5]) ───────────────────────────

            Conversation(
                id: UUID(), agentId: agents[5].id,
                projectId: projects[4].id,
                topicId: topics[11].id,
                title: "Hero section redesign",
                messages: [
                    msg(.user, "The hero section feels dated. What would you change?", ago: .hour, value: -3, from: now),
                    msg(.agent, "Three things: replace the stock photo with an animated product demo, increase the headline size by 20%, and add a secondary CTA below the fold. The current layout has too much visual noise.", ago: .hour, value: -2, from: now),
                    msg(.user, "What about the color scheme?", ago: .hour, value: -1, from: now),
                    msg(.agent, "Your primary blue is fine but the gradient feels 2019. Switch to a solid background with subtle depth using shadows. I'd also bump the contrast ratio on the CTA button, it's currently 3.2:1 which fails WCAG AA.", ago: .minute, value: -45, from: now),
                ],
                status: .unread, createdAt: date(ago: .hour, value: -4, from: now)
            ),
            Conversation(
                id: UUID(), agentId: agents[5].id,
                projectId: projects[5].id,
                topicId: topics[13].id,
                title: "Checkout UX review",
                messages: [
                    msg(.user, "Users are complaining the checkout is confusing. Can you review the flow?", ago: .day, value: -1, from: now),
                    msg(.agent, "Main issues: too many steps (5, should be 3), the progress indicator is unclear, and the form fields reset if you go back. I'd consolidate shipping + billing into one step and add inline validation.", ago: .day, value: -1, from: now),
                    msg(.user, "What about mobile?", ago: .day, value: -1, from: now),
                    msg(.agent, "On mobile, the 'Apply coupon' field pushes the CTA below the fold. Move it to a collapsible section. Also, the address autocomplete isn't working on iOS Safari, that's a huge friction point.", ago: .day, value: -1, from: now),
                ],
                status: .read, createdAt: date(ago: .day, value: -2, from: now)
            ),
            Conversation(
                id: UUID(), agentId: agents[5].id,
                projectId: projects[15].id,
                topicId: topics[29].id,
                title: "Photo editor toolbar layout",
                messages: [
                    msg(.user, "How should we lay out the editing tools? Bottom bar or side panel?", ago: .minute, value: -15, from: now),
                    msg(.agent, "Bottom bar for mobile, side panel for tablet. On mobile, use a scrollable icon strip with labels. Group tools: Basic (crop, rotate, flip), Adjust (brightness, contrast, saturation), AI (style transfer, background removal).", ago: .minute, value: -12, from: now),
                ],
                status: .unread, createdAt: date(ago: .minute, value: -20, from: now)
            ),

            // ── Legal (agents[6]) ──────────────────────────────

            Conversation(
                id: UUID(), agentId: agents[6].id,
                projectId: projects[14].id,
                title: "Open source license choice",
                messages: [
                    msg(.user, "We want to open source our Chat SDK. MIT or Apache 2.0?", ago: .day, value: -3, from: now),
                    msg(.agent, "If you want maximum adoption, MIT is simpler and more permissive. Apache 2.0 adds patent protection which matters if you hold patents. For a chat SDK, MIT is the standard choice.", ago: .day, value: -3, from: now),
                    msg(.user, "What about AGPL? Would that protect us better?", ago: .day, value: -3, from: now),
                    msg(.agent, "AGPL would require anyone using your SDK in a SaaS product to open-source their code. That kills enterprise adoption. If you want a copyleft option, consider LGPL instead, it allows linking without requiring the host app to be open source.", ago: .day, value: -2, from: now),
                ],
                status: .read, createdAt: date(ago: .day, value: -4, from: now)
            ),
            Conversation(
                id: UUID(), agentId: agents[6].id,
                projectId: projects[5].id,
                title: "GDPR data handling",
                messages: [
                    msg(.user, "We're launching in Europe. What do we need for GDPR compliance?", ago: .hour, value: -6, from: now),
                    msg(.agent, "Key requirements: cookie consent banner, privacy policy update, data processing agreements with third parties, right to deletion endpoint, and data export feature. You also need to appoint a DPO if processing at scale.", ago: .hour, value: -5, from: now),
                ],
                status: .unread, createdAt: date(ago: .hour, value: -7, from: now)
            ),

            // ── Coach (agents[7]) ──────────────────────────────

            Conversation(
                id: UUID(), agentId: agents[7].id,
                projectId: projects[8].id,
                topicId: topics[22].id,
                title: "4-week strength plan",
                messages: [
                    msg(.user, "Create a 4-week progressive overload program. I can train 4 days a week.", ago: .day, value: -1, from: now),
                    msg(.agent, "Here's an upper/lower split: Mon upper push, Tue lower quad, Thu upper pull, Fri lower hinge. Each week adds 2.5kg to compounds. Includes warm-up and deload in week 4.", ago: .day, value: -1, from: now),
                    msg(.user, "I don't have a barbell at home, only dumbbells and bands", ago: .day, value: -1, from: now),
                    msg(.agent, "Updated! Replaced barbell movements with DB alternatives. Added band-resisted exercises for progressive overload when dumbbells max out. Same split structure.", ago: .hour, value: -22, from: now),
                ],
                status: .read, createdAt: date(ago: .day, value: -2, from: now)
            ),
            Conversation(
                id: UUID(), agentId: agents[7].id,
                projectId: projects[8].id,
                title: "Macro calculation",
                messages: [
                    msg(.user, "Calculate my macros. 80kg, 178cm, moderately active, want to lean bulk", ago: .minute, value: -30, from: now),
                    msg(.agent, "TDEE estimate: ~2,650 kcal. For lean bulk add 250 kcal: 2,900 kcal daily. Protein 160g (2g/kg), fat 80g, carbs fill the rest at ~370g. On rest days drop carbs by 50g.", ago: .minute, value: -25, from: now),
                ],
                status: .unread, createdAt: date(ago: .minute, value: -35, from: now)
            ),

            // ── PM (agents[8]) ─────────────────────────────────

            Conversation(
                id: UUID(), agentId: agents[8].id,
                projectId: projects[5].id,
                title: "Sprint 14 planning",
                messages: [
                    msg(.user, "We need to plan sprint 14. Priorities: checkout fixes, search improvements, and the wishlist feature", ago: .hour, value: -2, from: now),
                    msg(.agent, "Suggested breakdown: Checkout fixes (8 pts, 3 tasks), Search improvements (13 pts, 5 tasks), Wishlist MVP (21 pts, 8 tasks). Total: 42 pts. Your velocity is 38. I'd move 2 wishlist tasks to sprint 15.", ago: .hour, value: -1, from: now),
                    msg(.user, "Can we fit it all if we skip the search synonym feature?", ago: .minute, value: -50, from: now),
                    msg(.agent, "Without synonyms that's 37 pts, fits your velocity. But synonyms account for 30% of failed searches, I'd keep it and defer the wishlist sharing feature instead.", ago: .minute, value: -45, from: now),
                ],
                status: .unread, createdAt: date(ago: .hour, value: -3, from: now)
            ),
            Conversation(
                id: UUID(), agentId: agents[8].id,
                projectId: projects[2].id,
                topicId: topics[6].id,
                title: "Tool calling spec",
                messages: [
                    msg(.user, "Draft a spec for the tool calling framework. Keep it concise.", ago: .day, value: -2, from: now),
                    msg(.agent, "Done. Covers: tool registration API, parameter schema validation, execution sandbox, result formatting, and error handling. 2 pages with diagrams.", ago: .day, value: -2, from: now),
                    msg(.user, "Add a section on rate limiting per tool", ago: .day, value: -1, from: now),
                    msg(.agent, "Added. Each tool can define maxCallsPerMinute and maxConcurrent. Defaults are 60/min and 5 concurrent. Exceeding limits returns a ToolRateLimited error.", ago: .day, value: -1, from: now),
                ],
                status: .read, createdAt: date(ago: .day, value: -3, from: now)
            ),
            Conversation(
                id: UUID(), agentId: agents[8].id,
                projectId: projects[12].id,
                title: "Feature prioritization matrix",
                messages: [
                    msg(.user, "Help me prioritize: virtual tours, mortgage calculator, saved searches, agent chat, neighborhood scores", ago: .minute, value: -10, from: now),
                ],
                status: .thinking, createdAt: date(ago: .minute, value: -12, from: now)
            ),

            // ── Marketer (agents[9]) ───────────────────────────

            Conversation(
                id: UUID(), agentId: agents[9].id,
                projectId: projects[4].id,
                topicId: topics[12].id,
                title: "SEO keyword research",
                messages: [
                    msg(.user, "Find the best keywords for our developer tools landing page", ago: .hour, value: -4, from: now),
                    msg(.agent, "Top opportunities: 'code review tool' (2.4K/mo, KD 35), 'automated testing platform' (1.8K/mo, KD 42), 'developer productivity' (3.1K/mo, KD 58). I'd target the first two, the third is too competitive.", ago: .hour, value: -3, from: now),
                    msg(.user, "What about long-tail keywords?", ago: .hour, value: -2, from: now),
                    msg(.agent, "Great long-tails: 'best code review tool for small teams' (320/mo, KD 12), 'automated testing for React apps' (450/mo, KD 18), 'how to speed up code reviews' (890/mo, KD 22). These convert 3x better.", ago: .hour, value: -1, from: now),
                ],
                status: .unread, createdAt: date(ago: .hour, value: -5, from: now)
            ),
            Conversation(
                id: UUID(), agentId: agents[9].id,
                projectId: projects[0].id,
                topicId: topics[1].id,
                title: "LinkedIn growth strategy",
                messages: [
                    msg(.user, "How do I grow my LinkedIn from 2K to 10K followers?", ago: .day, value: -3, from: now),
                    msg(.agent, "3-pillar strategy: (1) Post 5x/week with a hook-story-lesson format, (2) Comment on 20 posts daily from accounts with 10K+ followers, (3) Publish one long-form article per week. Expect 6-8 months to 10K.", ago: .day, value: -3, from: now),
                    msg(.user, "That's a lot of content. Can you give me a week of post ideas?", ago: .day, value: -2, from: now),
                    msg(.agent, "Mon: controversial take on AI tools. Tue: behind-the-scenes of your project. Wed: career lesson carousel. Thu: poll about dev workflows. Fri: weekend reading list thread. Each with headline drafts.", ago: .day, value: -2, from: now),
                ],
                status: .read, createdAt: date(ago: .day, value: -4, from: now)
            ),

            // ── DBA (agents[10]) ───────────────────────────────

            Conversation(
                id: UUID(), agentId: agents[10].id,
                projectId: projects[6].id,
                topicId: topics[17].id,
                title: "Rate limiter schema",
                messages: [
                    msg(.user, "Design a DB schema for a sliding window rate limiter", ago: .hour, value: -5, from: now),
                    msg(.agent, "Two options: (1) Redis sorted sets for in-memory, sub-ms lookups, or (2) Postgres with a requests table partitioned by hour. For your scale (<10K rps), Postgres is simpler. Schema: requests(id, client_id, endpoint, timestamp) with a composite index.", ago: .hour, value: -4, from: now),
                    msg(.user, "We expect to grow to 100K rps in 6 months", ago: .hour, value: -3, from: now),
                    msg(.agent, "Then go Redis from day one. Use ZRANGEBYSCORE for the window check. I'll add a Postgres audit log that syncs async for reporting. Here's the full architecture.", ago: .hour, value: -2, from: now),
                ],
                status: .read, createdAt: date(ago: .hour, value: -6, from: now)
            ),
            Conversation(
                id: UUID(), agentId: agents[10].id,
                projectId: projects[13].id,
                title: "Inventory query optimization",
                messages: [
                    msg(.user, "This inventory search query takes 4 seconds. Help me optimize it", ago: .minute, value: -15, from: now),
                    msg(.agent, "The query is doing a sequential scan on 2M rows. You need a composite index on (warehouse_id, product_id, quantity). Also, the subquery can be rewritten as a JOIN which lets the planner use a hash join instead of nested loops.", ago: .minute, value: -12, from: now),
                    msg(.user, "Down to 120ms. But the COUNT query on the same table is still slow", ago: .minute, value: -8, from: now),
                    msg(.agent, "COUNT(*) on large tables is inherently slow in Postgres. Use a materialized view that refreshes every 5 minutes, or maintain a counter in a separate table updated by triggers.", ago: .minute, value: -5, from: now),
                ],
                status: .unread, createdAt: date(ago: .minute, value: -20, from: now)
            ),

            // ── SecOps (agents[11]) ────────────────────────────

            Conversation(
                id: UUID(), agentId: agents[11].id,
                projectId: projects[1].id,
                topicId: topics[4].id,
                title: "E2E encryption audit",
                messages: [
                    msg(.user, "Review our encryption implementation. We're using Signal Protocol", ago: .day, value: -1, from: now),
                    msg(.agent, "Good choice. Issues found: (1) You're not rotating pre-keys after 100 messages, the spec recommends it. (2) Session state isn't encrypted at rest on the device. (3) The key derivation uses SHA-256 but Signal recommends HKDF-SHA-256 with proper info tags.", ago: .day, value: -1, from: now),
                    msg(.user, "How critical is issue #2?", ago: .day, value: -1, from: now),
                    msg(.agent, "High. If someone gets physical access to the device or extracts the app sandbox, they can read all session keys. Use the iOS Keychain with kSecAttrAccessibleWhenUnlockedThisDeviceOnly for session storage.", ago: .hour, value: -20, from: now),
                ],
                status: .read, createdAt: date(ago: .day, value: -2, from: now)
            ),
            Conversation(
                id: UUID(), agentId: agents[11].id,
                projectId: projects[5].id,
                topicId: topics[15].id,
                title: "Payment security review",
                messages: [
                    msg(.user, "Audit the payment flow before we go live", ago: .minute, value: -6, from: now),
                    msg(.agent, "Critical findings: (1) Card details are logged in the debug console. Remove all payment-related logging. (2) The webhook endpoint doesn't verify Stripe signatures, anyone can fake a payment success. (3) No idempotency key on charge creation, double charges possible.", ago: .minute, value: -4, from: now),
                ],
                status: .thinking, createdAt: date(ago: .minute, value: -8, from: now)
            ),
            Conversation(
                id: UUID(), agentId: agents[11].id,
                projectId: projects[6].id,
                topicId: topics[18].id,
                title: "Service mesh mTLS setup",
                messages: [
                    msg(.user, "We want to add mTLS between our microservices. Where do we start?", ago: .day, value: -5, from: now),
                    msg(.agent, "Start with a service mesh like Istio or Linkerd. Linkerd is lighter and easier to set up. Steps: (1) Install Linkerd control plane, (2) inject sidecar proxies, (3) enable strict mTLS mode. I'd do it service by service, not all at once.", ago: .day, value: -5, from: now),
                    msg(.user, "We're already on Kubernetes. Can we use native features?", ago: .day, value: -4, from: now),
                    msg(.agent, "K8s doesn't natively do mTLS. You need a mesh or manual cert management with cert-manager. The mesh approach is worth the overhead, it also gives you observability and traffic control for free.", ago: .day, value: -4, from: now),
                ],
                status: .read, createdAt: date(ago: .day, value: -6, from: now)
            ),
        ]
    }

    // MARK: - Helpers

    private static func msg(_ role: MessageRole, _ text: String, ago component: Calendar.Component, value: Int, from date: Date) -> Message {
        Message(
            id: UUID(),
            role: role,
            text: text,
            timestamp: Calendar.current.date(byAdding: component, value: value, to: date)!
        )
    }

    static func date(ago component: Calendar.Component, value: Int, from date: Date) -> Date {
        Calendar.current.date(byAdding: component, value: value, to: date)!
    }
}
