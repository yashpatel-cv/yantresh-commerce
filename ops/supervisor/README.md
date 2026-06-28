# Commerce Supervisor

Durable overnight orchestration for `yantresh-commerce`.

This loop is intentionally small:

- `plan.json` is the tracked queue and policy.
- `runtime-state.json` is the mutable state bag. It is ignored on purpose.
- A persistent OpenClaw session owns orchestration and spawns one fresh worker per milestone attempt.

## Required behavior

1. Read these files before acting:
   - `CLAUDE.md`
   - `PROJECT_BRIEF.md`
   - `docs/PRD.md`
   - `docs/ROUTER_REQUIREMENTS.md`
   - `ops/supervisor/plan.json`
   - `ops/supervisor/runtime-state.json`
2. Treat `runtime-state.json` as the TaskFlow-style persisted state bag.
3. Keep exactly one active milestone attempt at a time.
4. Spawn milestone workers with the default worker model pinned to `openai/gpt-5.4`.
   - OpenClaw `sessions_spawn` uses the tool-side alias `gpt-5.4`.
5. Persist state after every material event:
   - queue selection
   - worker spawn
   - worker success
   - worker failure
   - retry scheduling
   - skip / blocked decisions
6. On success:
   - mark the milestone completed
   - append a concise history record
   - advance to the next runnable milestone
7. On failure:
   - increment the attempt count
   - retry until `maxAttempts`
   - if still blocked, mark the milestone `skipped` with the failure reason and continue with the next viable milestone
8. Fail closed on overlapping dirty work:
   - never revert existing changes
   - if the next milestone overlaps dirty files, either adopt that slice carefully or defer it and continue with the next non-overlapping milestone
9. Use `sessions_yield` while waiting on child work. Do not poll loops.

## Queue discipline

- Prefer the smallest meaningful PRD-aligned slice.
- Use the roadmap order from `plan.json` unless the worktree makes a later slice safer.
- Keep early work foundation-first. Do not jump into broad feature development when an earlier phase is still incomplete.

## Recovery

If the supervisor session exits, resume by reading `runtime-state.json` and continuing from:

- `currentMilestoneId`
- `activeWorker`
- the milestone statuses and attempt counts

`runtime-state.json` is the only mutable source of truth for in-flight progress.
