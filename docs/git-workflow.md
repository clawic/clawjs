# Git Workflow

This repository should launch with a small set of long-lived branches and strict merge discipline.

## Long-lived branches

- `main`: always releasable. Only reviewed pull requests land here.
- `next`: integration branch for work that is ready for wider validation but not yet queued for the next tag.
- `release/0.x`: stabilization branch for the first public `0.x` line. Cut hotfixes here when you need to patch the latest release without pulling in everything from `next`.

## Short-lived branches

Create short-lived branches from the branch you intend to merge into:

- `feat/<scope>`
- `fix/<scope>`
- `docs/<scope>`
- `chore/<scope>`
- `refactor/<scope>`

Delete them after merge.

## Merge policy

- Protect `main`, `next`, and `release/*`.
- Require pull requests for those branches.
- Require the `CI` and `Release Gate` workflows to pass before merge.
- Prefer squash merges so the public history stays readable while individual commits can still follow `type(scope): description`.
- Keep release prep changes explicit: changelog, docs, versioning, and packaging checks in the same pull request.

## Tag policy

- Release tags use `v<semver>`, for example `v0.1.0`.
- Create tags from `main` for normal releases.
- Create tags from `release/0.x` only for patch releases that must not include everything currently in `next`.

## First release bootstrap

For the initial repository bootstrap, create these branches locally and in the remote:

1. `main`
2. `next`
3. `release/0.x`

Set `main` as the default branch, then enable protection rules for `main`, `next`, and `release/*`.
