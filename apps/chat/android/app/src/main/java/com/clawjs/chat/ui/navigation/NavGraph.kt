package com.clawjs.chat.ui.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import androidx.navigation.NavType
import com.clawjs.chat.AppContainer
import com.clawjs.chat.ui.screens.agentdetail.AgentDetailScreen
import com.clawjs.chat.ui.screens.chat.ChatScreen
import com.clawjs.chat.ui.screens.conversationlist.ConversationListScreen
import com.clawjs.chat.ui.screens.createagent.CreateAgentScreen
import com.clawjs.chat.ui.screens.projectdetail.ProjectDetailScreen
import com.clawjs.chat.ui.screens.settings.SettingsScreen
import com.clawjs.chat.ui.screens.topicdetail.TopicDetailScreen
import java.util.UUID

object Routes {
    const val LIST = "list"
    const val CHAT = "chat/{id}"
    const val AGENT = "agent/{id}"
    const val PROJECT = "project/{id}"
    const val TOPIC = "topic/{id}"
    const val SETTINGS = "settings"
    const val CREATE_AGENT = "createAgent"

    fun chat(id: UUID) = "chat/$id"
    fun agent(id: UUID) = "agent/$id"
    fun project(id: UUID) = "project/$id"
    fun topic(id: UUID) = "topic/$id"
}

@Composable
fun NavGraph(container: AppContainer) {
    val navController = rememberNavController()
    NavHost(navController = navController, startDestination = Routes.LIST) {
        composable(Routes.LIST) {
            ConversationListScreen(
                container = container,
                onOpenConversation = { navController.navigate(Routes.chat(it)) },
                onOpenAgent = { navController.navigate(Routes.agent(it)) },
                onOpenProject = { navController.navigate(Routes.project(it)) },
                onOpenCreateAgent = { navController.navigate(Routes.CREATE_AGENT) },
                onOpenSettings = { navController.navigate(Routes.SETTINGS) },
            )
        }
        composable(
            route = Routes.CHAT,
            arguments = listOf(navArgument("id") { type = NavType.StringType }),
        ) { entry ->
            val id = UUID.fromString(entry.arguments!!.getString("id"))
            ChatScreen(
                container = container,
                conversationId = id,
                onBack = { navController.popBackStack() },
            )
        }
        composable(
            route = Routes.AGENT,
            arguments = listOf(navArgument("id") { type = NavType.StringType }),
        ) { entry ->
            val id = UUID.fromString(entry.arguments!!.getString("id"))
            AgentDetailScreen(
                container = container,
                agentId = id,
                onBack = { navController.popBackStack() },
                onOpenConversation = { navController.navigate(Routes.chat(it)) },
            )
        }
        composable(
            route = Routes.PROJECT,
            arguments = listOf(navArgument("id") { type = NavType.StringType }),
        ) { entry ->
            val id = UUID.fromString(entry.arguments!!.getString("id"))
            ProjectDetailScreen(
                container = container,
                projectId = id,
                onBack = { navController.popBackStack() },
                onOpenConversation = { navController.navigate(Routes.chat(it)) },
                onOpenTopic = { navController.navigate(Routes.topic(it)) },
            )
        }
        composable(
            route = Routes.TOPIC,
            arguments = listOf(navArgument("id") { type = NavType.StringType }),
        ) { entry ->
            val id = UUID.fromString(entry.arguments!!.getString("id"))
            TopicDetailScreen(
                container = container,
                topicId = id,
                onBack = { navController.popBackStack() },
                onOpenConversation = { navController.navigate(Routes.chat(it)) },
            )
        }
        composable(Routes.SETTINGS) {
            SettingsScreen(
                container = container,
                onBack = { navController.popBackStack() },
            )
        }
        composable(Routes.CREATE_AGENT) {
            CreateAgentScreen(onBack = { navController.popBackStack() })
        }
    }
}
