# @clawjs/cli

Official CLI for Claw.

Install the CLI globally:

```bash
npm install -g @clawjs/cli
claw --help
```

The package exposes `claw` as the primary command and `clawjs` as a compatibility alias.

Official project flow:

```bash
claw new app my-app
cd my-app
npm run claw:init
claw generate skill support-triage
claw add telegram
```

The older `create-claw-*` packages still exist as compatibility wrappers, but `claw new` is now the primary documented entrypoint.
