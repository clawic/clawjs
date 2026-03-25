# @clawjs/openclaw-plugin

Base OpenClaw bridge plugin for ClawJS.

It registers:

- `clawjs.*` gateway RPC methods
- structured observability hooks
- optional agent tools
- lightweight diagnostic commands

Install with OpenClaw:

```bash
openclaw plugins install @clawjs/openclaw-plugin
openclaw plugins enable clawjs
openclaw gateway restart
```
