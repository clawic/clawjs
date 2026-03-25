# Chat Streaming Example

This example covers the closest thing to the end-user product surface:

- create a session
- append a user message with context chips
- stream assistant events
- force a gateway failure and recover through CLI fallback

Run [`../examples/chat-streaming-example.ts`](../examples/chat-streaming-example.ts) to demonstrate `transport`, `retry`, `chunk`, `done`, and title persistence in one place.

Key API surface:

- `claw.conversations.createSession()`
- `claw.conversations.appendMessage()`
- `claw.conversations.streamAssistantReplyEvents()`
