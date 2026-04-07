# ClawJSMac

Native macOS chat client for ClawJS, a port of the iOS app under `apps/chat/ios`.

## Architecture

- Pure SwiftUI, no dependencies, single `ClawJSMac` app target.
- `NavigationSplitView` layout with a persistent sidebar for Projects / Agents / Conversations.
- Talks directly to a ClawJS Relay instance via REST + SSE (same endpoints as the iOS app).
- Bundle identifier: `com.clawjs.mac`
- Deployment target: macOS 26 (Tahoe), required for the `glassEffect` Liquid Glass API shared with the iOS target.
- App Sandbox enabled with the network client entitlement.

## Requirements

- Xcode 16 or newer on macOS 26+
- A running ClawJS Relay reachable from the local machine. Defaults:
  - `relayBaseURL` = `http://127.0.0.1:4410`
  - `relayTenantId` = `demo-tenant`
  - `relayEmail` = `user@relay.local`
  - `relayPassword` = `relay-user`

These can be changed at runtime from the in-app Settings window (`Cmd+,`).

## Running

1. Start the Relay.
2. Open `ClawJSMac.xcodeproj` in Xcode.
3. Select the `ClawJSMac` scheme, destination `My Mac`.
4. Build and run (`Cmd+R`).

## Keyboard shortcuts

- `Cmd+N` . New Chat
- `Cmd+Return` . Send the message in the focused chat input
- `Cmd+,` . Open Settings

## Code layout

```
ClawJSMac/
  ClawJSMacApp.swift         App entry: WindowGroup + Settings scene + commands
  Models/                    Shared domain models (copied from iOS)
  Services/                  APIService, ChatService, MockData (copied from iOS)
  Localization/              L10n and 10 .lproj/Localizable.strings (copied from iOS)
  Views/
    Color+Compat.swift       NSColor shim so iOS-authored `Color(.systemGray*)` compiles
    RootSplitView.swift      NavigationSplitView host + detail NavigationStack
    SidebarView.swift        macOS-specific sidebar
    ChatView, ChatInputBar   Ported from iOS (keyboard modifiers removed, Cmd+Return added)
    AgentDetailView, ProjectDetailView, TopicDetailView, CreateAgentView
    SettingsView             Rewritten for native Settings scene (tabs: General/Relay/Data/About)
    AvatarView, StatusBadgeView, ThinkingIndicatorView, AgentStripView, PhosphorIcon
  Assets.xcassets
  Info.plist
  ClawJSMac.entitlements
```

## Differences from iOS

- Settings is a native `Settings` scene instead of an embedded page.
- Sidebar is native `NavigationSplitView` instead of a push stack with a floating action button.
- `swipeActions` replaced with `contextMenu` (right-click).
- `scrollDismissesKeyboard` / `navigationBar*` modifiers removed where iOS-only.
- `Color(.systemGray*)` is shimmed via `NSColor` extensions in `Views/Color+Compat.swift`.
