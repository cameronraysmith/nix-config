---
description: Stacked delivery roles, the one-commit-one-pull-request unit, and the division of labour between a worker returning a verified ref and the orchestrator publishing and authorizing the stack for asynchronous queue landing.
---

## Stacked landing protocol

The dispatched unit remains an OpenSpec change, normally bound to one Linear story, and each independently shippable delivery step is encoded as one commit and one pull request.

A worker prepares and verifies one step, maintains its single delivery commit, and returns that commit's ref together with its evidence, without publishing or landing anything.
Corrections amend or update that same delivery commit.
That narrowly overrides the atomic-commit and never-amend rule stated in the commit-behaviour fragment beside this one, and it overrides it only for the delivery commit of a stack unit; it never permits rewriting unrelated history.

The orchestrator alone orders the returned refs and publishes their pull-request stack through `mergify-stack`, subject to the first-party overrides in `git-stacked-pr-integration`.
It follows `git-stacked-pr-integration` §Queue authorization, including the installation-readiness hold, then hands landing to the queue asynchronously without waiting.

Git is the baseline and jj is an upgrade path rather than a fork in the protocol.
The `Change-Id` trailer format is shared, so moving the orchestrator or an individual worker to jj changes nothing about stack identity, pull-request bookkeeping, or landing.
The signal to switch is conflict volume in the orchestrator's integration step, not preference.

Repository-mode detection therefore selects local authoring and working-copy mechanics only.
In every local mode, consult `git-stacked-pr-integration` §Queue authorization for external handoff and `mergify-stack` for upstream publication mechanics under that owner's overrides.
In a repository containing a `.jj/` directory, the development-join, shared working-copy, hazard, recovery, and worktree-interop rules remain authoritative for local operations.

A note on the two context tiers, because it constrains what a project-level file may contain.
On a machine whose user profile already supplies the fleet and repository-class tiers, a project-level context file must not repeat them: harnesses that load both levels concatenate them without de-duplicating, so a project file that is a superset of the user-level one injects the shared prose twice.
Where no user-level context exists, as in an ephemeral clone, composing every tier into the project file is correct and is what the full composition mode is for.
