# Security Policy

## Supported versions

Only the latest `0.x` line is supported.

## Reporting

Do not open public issues for suspected vulnerabilities that could expose credentials, workspace contents, or remote execution paths. Report them privately to the maintainers first.

Repository ownership and review routing live under [`@clawic`](https://github.com/clawic). The primary maintainer is Iván González Dávila ([`@ivangdavila`](https://github.com/ivangdavila)).

## Secret handling expectations

- ClawJS masks common secret fields in logs and CLI JSON output, but callers should still avoid printing raw credentials.
- `auth.setApiKey()` and `auth.saveApiKey()` are low-level APIs. Prefer provider login flows, environment injection, or external secret stores when possible.
- Workspace audit logs are persisted under `.clawjs/audit/`. Review retention and redaction expectations before shipping ClawJS into regulated environments.
