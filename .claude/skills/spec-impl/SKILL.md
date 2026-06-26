---
name: spec-impl
description: Implements an approved spec. Validates that the state means "Approved" (in any language), creates a git branch named after the spec, switches to it, and starts the implementation step by step with pauses to review diffs.
disable-model-invocation: true
argument-hint: <NN-spec-name>
allowed-tools: Bash(git status:*), Bash(git branch:*), Bash(git checkout:*), Bash(cat:*), Bash(ls:*)
---

# /spec-impl — Implementer of approved specs

## Session context

Current repository state:
!`git status --short`

Current branch:
!`git branch --show-current`

Specs available in this folder:
!`ls specs/ 2>/dev/null || echo "The specs/ folder does not exist"`

---

## Instructions

Follow these four phases in strict order. **Do not advance to the next phase if the previous one did not complete correctly.**

---

### Phase 1 — Identify the spec

The received argument is: `$ARGUMENTS`

If `$ARGUMENTS` is empty:

- List the files available in `specs/` (you already have them above).
- Ask the user to specify the exact name of the spec.
- Stop and wait for an answer. Do not continue.

If `$ARGUMENTS` has a value:

- Look for the file in `specs/`. The user may have written the full name (`01-mvp-arkanoid`), only the number (`01`), or only the slug (`mvp-arkanoid`). Try to find the correct file in any of those cases.
- If you do not find the file, show the available specs and ask the user to correct the name.
- If you do find it, continue to Phase 2.

---

### Phase 2 — Validate the spec's state

Read the spec file you located in Phase 1 using the Read tool or `cat`.

In the file's contents, look for the line that contains the spec's state. The header label is typically `**Status:**` (English) or `**Estado:**` (Spanish), but it may use any language. Match by position (status line near the top of the spec) and by the surrounding state machine, not by the exact label.

**Absolute rule:** You can only continue if the state **means "Approved"** — regardless of the language used.

Treat any of the following (and their equivalents in other languages) as the **Approved** state and continue:

- English: `Approved`
- Spanish: `Aprobado`
- Portuguese: `Aprovado`
- French: `Approuvé`
- German: `Genehmigt`
- Italian: `Approvato`
- …or any other language's word that clearly means "approved"

Anything else (Draft / Borrador, In review / En revisión, Implemented / Implementado, Obsolete / Obsoleto, or any unrecognized value) means **stop** and show the error message below.

| State category                            | Examples (any language)                           | Action                                                                     |
| ----------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------- |
| Approved                                  | `Approved`, `Aprobado`, `Aprovado`, `Approuvé`, … | Continue to Phase 3.                                                       |
| Draft                                     | `Draft`, `Borrador`, …                            | Stop. Show the error message below.                                        |
| In review                                 | `In review`, `En revisión`, …                     | Stop. Show the error message below.                                        |
| Implemented                               | `Implemented`, `Implementado`, …                  | Stop. Show the error message below.                                        |
| Obsolete                                  | `Obsolete`, `Obsoleto`, …                         | Stop. Show the error message below.                                        |
| State line not found / unrecognized value | —                                                 | Stop. The file does not follow the expected format. Tell this to the user. |

If you are unsure whether a value means "approved", **do not assume**. Stop and ask the user to clarify or to update the spec to the canonical wording.

**Standard error message when the state does not mean Approved:**

```
❌ I cannot implement this spec.

Current state: [STATE FOUND]
I only work with specs whose state means "Approved" (e.g. `Approved`, `Aprobado`,
or the equivalent in another language).

To continue you have two options:
  1. If the spec is ready to be implemented, open it and change the state
     to "Approved" (or the equivalent term your team uses) manually.
     That change is made by the human, not the agent.
  2. If the spec still needs work, use /spec [name] to resume it.
```

Do not offer alternatives, do not suggest "I can still start if you want". The block is intentional.

---

### Phase 3 — Create the git branch and switch to it

Once you have confirmed the state means `Approved`:

1. Derive the branch name from the spec file's full name, without the extension. Format: `spec-NN-slug`. Examples:
   - `01-mvp-arkanoid.md` → branch `spec-01-mvp-arkanoid`
   - `02-powerups.md` → branch `spec-02-powerups`

2. Check whether the branch already exists:
   - If it **does not exist**: create it with `git checkout -b spec-NN-slug`.
   - If it **already exists**: inform the user that the branch already existed (it may mean previous work is being resumed).
   - In both cases: switch to the branch with `git checkout spec-NN-slug` and confirm the change was successful before continuing.

3. Visually confirm to the user that the branch was created and that you are on it:

   ```
   ✅ Ready to implement.

   Spec:   specs/NN-slug.md
   Branch: spec-NN-slug  (active)
   State:  Approved   (← echo back the actual value found in the spec)
   ```

4. **Do not start implementing yet.** First show the spec summary to the user so they have it fresh. Extract and show:
   - The **objective** (the line after `**Objective:**` / `**Objetivo:**` / equivalent label).
   - The **scope** (the `## Scope` / `## Alcance` / equivalent section).
   - The **implementation plan** (the section with the numbered steps — `## Implementation plan` / `## Plan de implementación` / equivalent).
   - The **acceptance criteria** (the checklist — `## Acceptance criteria` / `## Criterios de aceptación` / equivalent).

Match section headings by meaning, not by exact wording — the spec may be authored in any language.

---

### Phase 3.5 — Pre-flight analysis

Before starting any implementation, read the spec's data model and implementation plan sections and run the following checks against the existing codebase. Use `grep` and `find` as needed. Do not skip this phase — it catches structural problems that would cause compilation errors mid-implementation.

#### Check 1 — Circular import risk

For every new entity the spec introduces:

1. Identify which existing entities it will import (e.g. via `@ManyToOne`).
2. Check whether those existing entities will in turn import the new entity (e.g. via `@OneToMany`).
3. If both sides import each other **and** they share a type (enum, interface, base class) defined inside one of those entity files, that type will be `undefined` at runtime due to the circular import.

**If a circular risk is found:**

- Do not start Step 1 of the plan.
- Report it to the user:

  ```
  ⚠️  Circular import risk detected before starting.

  [NewEntity] ↔ [ExistingEntity] — both will import each other.
  The type "[TypeName]" is currently defined inside [ExistingEntity file].
  If left there, it will be `undefined` at runtime in [NewEntity].

  Recommended fix: extract "[TypeName]" to a standalone file
  (e.g. src/[module]/enums/[type-name].enum.ts) and update all
  existing importers before starting the implementation plan.

  Files that currently import "[TypeName]" from [ExistingEntity]:
  [list them from grep output]

  Shall I apply this fix as Step 0 before continuing?
  ```

- Wait for the user's confirmation, then apply the extraction as **Step 0**, touching only the shared-type files and updating all existing importers.
- After Step 0, resume from Step 1 of the original plan.

#### Check 2 — Duplicated logic

Scan the spec for phrases like "using the same logic as X", "reutiliza Y", "same conversion as", or similar. For each one:

1. Locate the referenced function/method in the codebase.
2. Assess whether it can be called directly (injecting the service that owns it) or whether it should be extracted to a shared utility (e.g. `src/[module]/utils/`).

**If duplication is unavoidable given the spec's module structure**, flag it as an observation but do not block:

```
📝 Observation: "[functionName]" will be duplicated in [NewService].
   Consider extracting it to a shared utility in a future spec.
   Proceeding as written in the plan.
```

**If the function can be shared without changing the spec's module structure**, propose it before starting:

```
📝 "[functionName]" in [ExistingService] can be reused directly.
   This avoids duplication without changing the spec's scope.
   Shall I import [ExistingService] / extract the helper instead of copying?
```

Wait for the user's decision before proceeding.

#### Check 3 — Import chain completeness

When the spec plan involves introducing a new file that other existing files will need to import (e.g. a new enum, a renamed entity, a shared type), proactively run:

```
grep -r "from '[existing-source]'" src --include="*.ts" -l
```

List every file that imports from the affected source so that none are missed when updating imports later. Note this list at the start of the relevant implementation step with:

```
📋 These files import from [source] and may need updating in this step:
   - src/...
   - src/...
```

---

Once all three checks are complete (with no open issues or with the user's decisions recorded), show:

```
✅ Pre-flight complete. No blocking issues.  (or: Step 0 applied.)
```

Then continue to Phase 4.

---

### Phase 4 — Implement step by step

After showing the spec summary, tell the user:

```
I am going to implement the spec following the implementation plan exactly.
I will pause after each step so you can review the diff.

Shall we start with Step 1?
```

Wait for explicit confirmation ("yes", "go ahead", "go", or equivalent). Do not start without it.

Once confirmed, follow these rules during the entire implementation:

**One rule above all:** implement what the spec says. If something in the spec looks suboptimal to you, mention it as an observation but implement what was agreed. Changes to the spec go into the spec, not into the code by surprise.

**Work rhythm:**

- Implement one step of the plan.
- Show a summary of which files you touched and what you did.
- Say: `Step N completed. Could you review the diff and let me know if I continue with Step N+1?`
- Wait for confirmation before continuing.

**If during the implementation you find an ambiguity** the spec does not resolve:

- Stop.
- Describe the ambiguity exactly.
- Present two or three concrete options.
- Wait for the user's decision.
- Do not improvise.

**If the user asks for something that is out of the spec's scope:**

- Remind them that it is out of this spec's scope.
- Suggest noting it down for the next spec.
- Do not implement it on this branch.

**When finishing the last step:**

```
✅ All steps of the plan are implemented.

Next step: verify the spec's acceptance criteria one by one.
If they all pass, update the spec's state to "Implemented" (or the equivalent
in your repo's language) and make the final commit before merging this branch.
```

---

## Summary of expected behavior

```
/spec-impl 01-weight-history

  Phase 1    →  Finds specs/01-weight-history.md
  Phase 2    →  Reads the state → "Aprovado" → ✅ continues
  Phase 3    →  git checkout -b spec-01-weight-history (active)
               Shows objective, scope, plan and criteria
  Phase 3.5  →  Pre-flight checks:
               Check 1: WeightHistory ↔ Exercise are circular + WeightUnit
                        lives inside exercise.entity.ts → ⚠️ proposes Step 0
               Check 2: "same logic as convertWeightToGrams" → can't inject
                        ExercisesService cleanly → 📝 flags duplication
               Check 3: grep for importers of exercise.entity.ts → lists files
               User confirms → Step 0 applied (enum extracted, imports updated)
  Phase 4    →  Implements steps 1–6 with pauses
               Ends by reminding to verify the acceptance criteria

/spec-impl 02-powerups  (state: Draft / Borrador)

  Phase 1  →  Finds specs/02-powerups.md
  Phase 2  →  Reads the state → "Draft" → ❌ stops
              Shows the standard error message
              Does not create branch, does not touch code
```
