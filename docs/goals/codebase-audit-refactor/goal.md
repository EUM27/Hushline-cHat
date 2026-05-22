# Codebase Audit, Refactor, and Improvement Map

## Objective

Audit the Hushline cHat codebase, identify evidence-backed health and improvement areas, complete safe refactoring slices when approved by the GoalBuddy board, and leave durable verification receipts.

## Original Request

"전체 코드베이스에 대해 필요한 경우 전체 감사 및 리팩토링을 완료하고, 동시에 개선 및 확장을 위한 다양한 영역을 식별하세요"

## Intake Summary

- Input shape: `vague`
- Audience: project owner and future implementers
- Authority: `requested`
- Proof type: `test`
- Completion proof: documented audit findings, passing relevant verification commands, reviewed refactoring diffs for each completed safe slice, and a ranked improvement/extension map.
- Likely misfire: spending effort on broad cleanup or speculative redesign instead of evidence-backed fixes that preserve current behavior.
- Blind spots considered: scope boundaries, success proof, non-goals, dirty-file handling, and whether implementation should prioritize safety, product improvement, or architecture.
- Existing plan facts: local live board selected by the user; first priority is code health and stability; success proof is verification-command pass plus refactoring diff; docs, specs, and dirty files are in audit scope.

## Goal Kind

`open_ended`

## Current Tranche

Run a continuous evidence-driven tranche: map the repository, choose the first safe implementation slice, implement and verify it, audit the slice, and continue only where the board proves the next work is safe and valuable.

## Non-Negotiable Constraints

- Preserve unrelated dirty work already present in the repository.
- Include docs, specs, and current dirty files in read-only audit scope; modify dirty files only through explicit bounded Worker tasks when clearly required.
- Do not edit implementation files without an active bounded Worker task.
- Keep Scout and Judge tasks read-only.
- Prefer concrete file-path evidence and verification commands over generic advice.
- Preserve existing behavior while refactoring unless the user explicitly approves a behavior change.

## Stop Rule

Stop only when a final audit proves the full original outcome is complete.

Do not stop after planning, discovery, or Judge selection if the user asked for working software or automation and a safe Worker task can be activated.

Do not stop after a single verified Worker slice when the broader owner outcome still has safe local follow-up slices. After each slice audit, advance the board to the next highest-leverage safe Worker task and continue.

Do not stop because a slice needs owner input, credentials, production access, destructive operations, or policy decisions. Mark that exact slice blocked with a receipt, create the smallest safe follow-up or workaround task, and continue all local, non-destructive work that can still move the goal toward the full outcome.

## Canonical Board

Machine truth lives at:

`docs/goals/codebase-audit-refactor/state.yaml`

If this charter and `state.yaml` disagree, `state.yaml` wins for task status, active task, receipts, verification freshness, and completion truth.

## Run Command

```text
/goal Follow docs/goals/codebase-audit-refactor/goal.md.
```

## PM Loop

On every `/goal` continuation:

1. Read this charter.
2. Read `state.yaml`.
3. Run the bundled GoalBuddy update checker when available and mention a newer version without blocking.
4. Re-check the intake: original request, input shape, authority, proof, blind spots, existing plan facts, and likely misfire.
5. Work only on the active board task.
6. Assign Scout, Judge, Worker, or PM according to the task.
7. Write a compact task receipt.
8. Update the board.
9. If Judge selected a safe Worker task with `allowed_files`, `verify`, and `stop_if`, activate it and continue unless blocked.
10. If a problem, suggestion, or follow-up should become a repo artifact, create an approved issue/PR or ask the operator whether to create one.
11. Treat a slice audit as a checkpoint, not completion, unless it explicitly proves the full original outcome is complete.
12. Finish only with a Judge/PM audit receipt that maps receipts and verification back to the original user outcome and records `full_outcome_complete: true`.

Issue and PR handoffs are supporting artifacts. `state.yaml` remains authoritative, and every external artifact decision must be recorded in a task receipt.
