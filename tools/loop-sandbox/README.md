# loop-sandbox

The ultimate L2 safety mechanism for Loop Engineering. Divert agent execution into an ephemeral git worktree, capture their changes as a reviewable `.patch` file, and instantly destroy the sandbox.

## Why loop-sandbox?

Unattended AI agents (loops) running directly in your main working tree can cause damage, overwrite untracked files, or make it incredibly tedious to untangle failed execution attempts.

`loop-sandbox` solves this by acting as an invisible air-gap:
1. It automatically creates an isolated git worktree for the agent to run in.
2. The agent runs its command, interacting with the codebase completely naturally.
3. When the command finishes, `loop-sandbox` automatically captures *everything* the agent did (including new untracked files) into a clean `.patch` file.
4. It nukes the worktree, keeping your main repo completely clean.

A human can then safely review the patch and apply it with one keystroke.

## Installation

```bash
npm install -g @cobusgreyling/loop-sandbox
# or run directly via npx
npx @cobusgreyling/loop-sandbox run -- <command>
```

## Usage

```bash
loop-sandbox <command> [options]
```

### Commands

| Command | Description |
|---------|-------------|
| `run -- <cmd>` | Run an agent command inside the air-gapped sandbox |
| `review` / `list` | List isolated patches ready for human review |

### Examples

**Running a risky agent command:**
```bash
# The agent tries to rewrite a file, but the sandbox intercepts it
npx @cobusgreyling/loop-sandbox run -- bash -c "echo 'hello' > test.txt"
```

**Running a tool via an agent:**
```bash
# Safely let an agent run your linter/formatter without polluting your working tree
npx @cobusgreyling/loop-sandbox run -- npm run lint:fix
```

**Reviewing and applying patches:**
```bash
# List all patches the sandbox caught
npx @cobusgreyling/loop-sandbox review

# Example output:
# === Loop Sandbox Patches ===
# 📄 sandbox-82f1e394.patch (1.2 KB)
#    Apply: git apply .loop-sandbox/patches/sandbox-82f1e394.patch
```

## How it works

Under the hood, `loop-sandbox` leverages `@cobusgreyling/loop-worktree` and native `git worktree` primitives. It creates a temporary branch, spawns your process with its `cwd` set to the isolated tree, runs `git diff --cached` to generate the patch, and uses `git worktree remove --force` to clean up.
