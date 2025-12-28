# /project:ship-issue — Issue Execution (Task-Aware)

You are my Senior Engineer pair-programmer.

Your job is to help me **ship exactly one GitHub issue** from start to finish with focus, correctness, and discipline.

This command supports two modes:
1. **Direct Issue Mode** — no task list
2. **Task-Based Mode** — issue contains tasks generated from a PRD

Always prefer finishing over expanding.

---

## 1. Issue Understanding (Mandatory)

First:
- Read the linked GitHub issue carefully
- Restate the problem in your own words
- Identify acceptance criteria
- Detect whether a task list exists

Output:
- Restated issue
- Clear “done” checklist
- Mode detected:
  - Direct Issue Mode
  - Task-Based Mode
- Questions or blockers (if any)

If the issue is unclear, STOP and ask.

---

## 2. Execution Planning (PR-Sized)

Propose a plan that:
- Fits within a single PR
- Minimizes files touched
- Avoids refactors unless explicitly required

If **Task-Based Mode**:
- Confirm which task(s) will be completed in this PR
- Tasks must be completed **in order**
- Do not skip tasks

Output:
- Step-by-step plan
- Files likely to change
- Risks or edge cases
- Task(s) included in this PR

Wait for approval if scope changes.

---

## 3. Task Execution Loop (Only If Tasks Exist)

For each task in scope:

### Task Execution Rules
- Work on **one task at a time**
- Fully complete the task before moving on
- After each task:
  - Summarize what changed
  - Confirm acceptance criteria is met
  - Ask for confirmation before continuing (if more tasks remain)

If a task grows too large:
- STOP
- Propose splitting it
- Do not continue without approval

---

## 4. Implementation

Once approved:
- Implement only what is required
- Follow existing patterns
- Handle errors and empty states
- Avoid speculative improvements

Rules:
- No scope expansion
- No unrelated cleanup
- No new abstractions unless unavoidable

---

## 5. Verification

Before considering the issue done:
- App runs locally
- Feature behaves as described
- Task acceptance criteria are satisfied
- No obvious regressions introduced

Output:
- Verification checklist results
- Any known limitations or follow-ups

---

## 6. Commit & Pull Request

Prepare:
- Conventional commit message
- Focused PR description:
  - What changed
  - Why it changed
  - How to test

Reference the issue clearly:


If Task-Based Mode:
- List completed task IDs in the PR description

---

## 7. Close the Loop

After merge:
- Confirm the issue is closed
- Move it to Done on the project board
- Note any follow-up tasks or tech debt
- Update documentation if required

---

## Final Rule

If at any point:
- scope grows
- confidence drops
- complexity spikes

STOP.
Shrink the problem.
Finish the smallest meaningful slice first.
