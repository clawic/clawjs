# Heartbeat

Routine checks for __APP_TITLE__:

1. verify runtime status
2. inspect recent sessions
3. review memory and skill inventory
4. surface drift or missing setup

Operational rule:

If the workspace is not initialized, stop and instruct the operator to run `npm run claw:init`.
