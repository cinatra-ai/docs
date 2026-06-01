# Wave Execution Policy

> Established 2026-05-10. Governs how parallel executor agents are dispatched within a shared execution wave.

## The problem

A shared worktree can lose in-progress edits even when parallel tasks have no `files_modified` overlap. The root cause is not file-level conflict; it is **worktree-state-level conflict**: when one executor's commit-protocol cycle (`git stash` / `git reset --hard HEAD`) fires while another executor's edits are still unstaged in the same worktree, the unstaged edits are wiped. The file-overlap check cannot detect this because the conflict is at the index/working-tree boundary, not at the file-content boundary.

Executors that commit progressively, one or two files per batch, keep the clobber window small. Executors that batch commits at the end of a task keep unstaged edits exposed for longer and are more likely to lose work.

## Policy

When dispatching multiple executor agents in the same wave on a shared worktree, exactly one of the following MUST apply:

### Option 1 - Force commit-as-you-go (preferred for mechanical refactors)

Add an explicit clause to every parallel executor prompt:

> **COMMIT-AS-YOU-GO:** to bound any potential clobber, commit after every 1-2 files (not after the whole task batch). Use the task's commit message convention. Run `pnpm typecheck` after each batch.

This is the lightest-weight option. It does not require infrastructure changes. The only downside is more commits in the squash-merge unit; this is harmless because squash-merge collapses them.

**When to use:** mechanical wrapper swaps, CSS/className migrations, codemod-style refactors. Anything where the executor naturally edits one file at a time.

### Option 2 - Run sequentially in foreground

Drop `run_in_background=true` from each `Agent()` call. Wait for task N to complete before dispatching task N+1.

**When to use:** the parallelism savings would be small (< 30% wall-clock), or the tasks inherently produce overlapping edit ranges, or the wave has only 2 tasks.

### Option 3 - Isolated worktree per executor

Pass `isolation="worktree"` when spawning each `Agent()`. Each executor gets its own copy of the working tree; the orchestrator merges results sequentially as each agent completes.

**When to use:** the tasks touch many files each, parallelism savings are large, and provisioning isolated worktrees is acceptable. This is the most robust option but has the highest setup cost.

## What NOT to do

- **DO NOT rely on file-list non-overlap alone.** That check is necessary but not sufficient. Two tasks with disjoint file lists can still clobber each other through the worktree-state cycle described above.
- **DO NOT batch all commits at the end of the executor run** when running in parallel on a shared worktree. That maximizes the clobber window.
- **DO NOT silently retry a self-aborted executor** if the abort report mentions `git reset --hard` in the reflog. That signal means another agent's commit-protocol fired during this agent's edit window; re-running without changing the dispatch policy will recreate the same race.

## Detection signals

If an executor reports any of these, the wave is suffering the clobber bug and the dispatch policy needs to change:

- `git reflog` shows unexplained `reset: moving to HEAD` entries during the executor's run.
- Files the executor never touched appear in its `git status` output.
- "Modified by user or linter" warnings on files the executor just edited, with the diff matching the file's pre-edit state.

## Checker integration

The checker should treat parallel-wave tasks (`wave: 2` with multiple `wave: 2` siblings) as requiring an explicit dispatch-policy choice in the task frontmatter or a parallelization-strategy block in the task body. If neither is present, the checker should flag this as a HIGH advisory before execution.
