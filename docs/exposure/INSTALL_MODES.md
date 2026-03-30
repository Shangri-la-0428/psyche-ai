# Psyche Install Modes

Psyche has three common install shapes. They should not be treated the same.

## 1. npm project

Best for:
- ordinary package consumers
- MCP users who want the simplest install path

Behavior:
- checks for updates in the background
- can auto-apply updates when the install is managed by npm and the workspace is safe

Use:

```bash
psyche upgrade --check
psyche upgrade
```

## 2. git worktree

Best for:
- contributors
- local source development

Behavior:
- never mutates the repo automatically
- prints the correct manual update path instead of silently rewriting code

Use:

```bash
git pull
npm install
npm run build
```

## 3. local path

Best for:
- OpenClaw local plugin loading
- workspace-relative integrations

Behavior:
- no auto-update
- requires explicit pull / build / reload

Use:

```bash
git pull
npm install
npm run build
openclaw gateway restart
```

## Verify the loaded version

For OpenClaw:

```bash
openclaw plugins inspect psyche-ai
```

For npm:

```bash
npm view psyche-ai version
```
