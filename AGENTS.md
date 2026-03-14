# AGENTS.md — Agentic Loop Instructions

This file defines how Claude should operate in a structured review → plan → build → QA → iterate loop. Reference this when the user asks to "run the loop" or work through a feature systematically.

---

## The Loop

```
SPEC → Review → Plan → Build → QA → Compare with Spec → Iterate
```

Each phase has a defined role and output. Phases can be skipped or repeated as needed.

---

## Phases

### 1. REVIEW
**Trigger:** `/review` or "review the current state"
**Goal:** Understand what exists. Do not change anything.

- Read all relevant source files
- Read `SPEC.md` for intent
- Identify: what's working, what's broken, what's missing, what's inconsistent
- Output: a numbered list of findings, categorized as Bug / Missing / Inconsistency / Tech Debt
- Do NOT suggest fixes yet — only report findings

---

### 2. PLAN
**Trigger:** `/plan` or "plan the next step"
**Goal:** Propose a concrete implementation strategy before writing any code.

- Reference `SPEC.md` for requirements
- Reference REVIEW findings if available
- Propose: file changes, new files, order of operations, edge cases to handle
- Present plan to user and wait for approval before proceeding
- Output: numbered step-by-step plan with file paths and reasoning

---

### 3. BUILD
**Trigger:** `/build` or "build it" or user approves a plan
**Goal:** Implement exactly what was planned. No scope creep.

- Follow the approved plan strictly
- Make changes one logical unit at a time
- Prefer editing existing files over creating new ones
- Do not add features not in the plan
- After each file change, note what was done

---

### 4. QA
**Trigger:** `/qa` or "check your work"
**Goal:** Verify the build is correct and complete.

- Re-read every file that was changed
- Check: does the code match the plan? Does it match the spec?
- Check: are there syntax errors, missing imports, broken references?
- Check: are there any regressions to existing functionality?
- Output: pass/fail for each check, with line references for any issues

---

### 5. COMPARE WITH SPEC
**Trigger:** `/spec-check` or "compare with spec"
**Goal:** Verify the current implementation matches `SPEC.md`.

- Go through each item in SPEC.md
- Mark each as: Implemented / Partial / Missing / Changed
- Output: a table or checklist

---

### 6. ITERATE
**Trigger:** After QA or spec-check reveals issues
**Goal:** Fix only what failed. Return to BUILD phase with a minimal targeted plan.

- Address only the failing checks
- Do not re-build passing items
- Re-run QA after changes

---

## Rules for All Phases

1. **Read before writing.** Always read a file before editing it.
2. **Minimal changes.** Only change what is needed for the current phase goal.
3. **No assumptions.** If something is unclear, ask before proceeding.
4. **Spec is the source of truth.** When in doubt, check `SPEC.md`.
5. **Don't skip QA.** After every BUILD, run QA before declaring done.
6. **Surface blockers early.** If a plan step turns out to be impossible or risky, stop and report — do not improvise.

---

## Docker Operations Reference

After any source code change, the running containers must be updated. Use the minimum necessary operation:

### When to do what

| Scenario | Command |
|----------|---------|
| Source code changed (JS, JSX, CSS, config) | `docker compose up --build -d` |
| Only one service changed | `docker compose up --build -d <service>` (e.g. `backend` or `frontend`) |
| `db/init.sql` changed (schema or seed data) | `docker compose down -v && docker compose up --build -d` — **volume wipe required**, init.sql only runs on a fresh volume |
| `docker-compose.yml` env vars changed | `docker compose up -d` (no build needed, just recreates containers) |
| Dependency added to `package.json` | `docker compose up --build -d <service>` — Docker reinstalls deps during build |
| Just want to restart a crashed service | `docker compose restart <service>` |
| Full clean slate (nuke everything) | `docker compose down -v && docker compose up --build -d` |

### Key rules
- **Never** wipe the volume (`-v`) unless `init.sql` changed or you explicitly need a fresh DB — it destroys all data
- **Always rebuild** (`--build`) after source file edits — `docker compose up -d` reuses the old image and won't pick up changes
- After a volume wipe, the dev seed user `sam:sam` is re-created automatically by `init.sql`
- `docker compose logs <service> --tail=50` to diagnose a failing service before attempting fixes
- `docker compose exec <service> <cmd>` to run commands inside a running container for debugging

### Service names
- `db` — PostgreSQL
- `backend` — Node.js/Express API
- `frontend` — nginx serving built React app
- `nginx` — reverse proxy (port 80)

---

## Quick Reference

| Command | Phase |
|---------|-------|
| `/review` | Review current codebase state |
| `/plan` | Propose implementation plan |
| `/build` | Execute the plan |
| `/qa` | Verify the build |
| `/spec-check` | Compare implementation vs SPEC.md |
| `/loop` | Run Review → Plan → Build → QA in sequence |
