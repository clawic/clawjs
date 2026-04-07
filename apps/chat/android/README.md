# ClawJS Android

Native Android port of `apps/chat/ios/ClawJS`. Kotlin + Jetpack Compose + Material 3, targeting API 35 with minSdk 26. Talks directly to the OpenClaw Relay (no intermediate Node adapter) and mirrors the iOS feature set 1:1.

## Prerequisites

- Android Studio Hedgehog or newer (for the bundled Android SDK and emulator).
- JDK 17 (Android Studio ships with one).
- A running OpenClaw Relay reachable from the device/emulator. From the Android emulator the host machine's `localhost` is `10.0.2.2`, so the default relay URL is `http://10.0.2.2:4410`.

## Build

```sh
cd apps/chat/android
./gradlew :app:assembleDebug
```

The APK lands at `app/build/outputs/apk/debug/app-debug.apk`.

## Run

Install on a running emulator/device:

```sh
./gradlew :app:installDebug
adb shell am start -n com.clawjs.chat/.MainActivity
```

Or open the `apps/chat/android/` directory in Android Studio and hit Run.

## Configure the Relay

Defaults match the iOS app:

| Setting       | Default                 |
| ------------- | ----------------------- |
| Base URL      | `http://10.0.2.2:4410`  |
| Tenant ID     | `demo-tenant`           |
| Email         | `user@relay.local`      |
| Password      | `relay-user`            |

All four are editable inside the app via Settings → Relay. On a physical device you'll want to change the base URL to the actual host address.

## Architecture

- `com.clawjs.chat.data.model` — Models 1:1 with `ClawJS/Models/Models.swift`.
- `com.clawjs.chat.data.remote.ApiClient` — port of `APIService.swift`. OkHttp + kotlinx.serialization + okhttp-sse for the `/stream` endpoint.
- `com.clawjs.chat.data.settings.SettingsStore` — DataStore Preferences mirror of the iOS `UserDefaults` keys.
- `com.clawjs.chat.data.mock.MockData` — offline fallback used when the Relay is unreachable on bootstrap.
- `com.clawjs.chat.domain.ChatRepository` — port of `ChatService.swift`. StateFlow-driven, handles the UUID ↔ remoteId maps, streaming and fallback.
- `com.clawjs.chat.ui.screens.*` — seven Compose screens matching the iOS view hierarchy:
  - `conversationlist` / `chat` / `agentdetail` / `projectdetail` / `topicdetail` / `settings` / `createagent` (stub).
- `com.clawjs.chat.ui.navigation.NavGraph` — Compose Navigation host.

## Localization

Eleven locales, sourced from `apps/chat/ios/ClawJS/Localization/*.lproj/Localizable.strings`:

`en` (default), `es`, `fr`, `de`, `it`, `pt-rBR`, `ja`, `ko`, `zh-rCN`, `ar`.

The app uses `AppCompatDelegate.setApplicationLocales` for per-app locale override, so users can pick a language from Settings without affecting the system locale. Arabic gets automatic RTL layout because the manifest declares `android:supportsRtl="true"`.

## Tests

```sh
./gradlew :app:testDebugUnitTest
```
