# PRD Router Requirements

This file is the intake contract for `prd-delivery-router`.

It is not a second PRD and not a new source of truth. It exists so the router
can reliably turn a PRD into milestone-by-milestone execution without guessing.

## Source of truth

The router must defer to these canonical artifacts:

- `docs/PRD.md`
- `docs/schema.sql`
- `docs/contracts.ts`
- `CLAUDE.md`
- `PROJECT_BRIEF.md`

If this file conflicts with any of those, those files win.

## Required PRD inputs

The router should not start a major implementation loop until it can identify:

1. Product goal
   - What is being built.
   - Who it is for.
   - What "done" means at the product level.

2. Current phase
   - Which roadmap phase is active now.
   - The exit test for that phase.

3. Deliverables
   - Concrete outputs expected in this slice.
   - Repo areas or services expected to change.

4. Acceptance criteria
   - Observable checks for success.
   - Verification steps the router can run.

5. Constraints
   - Architecture constraints.
   - Infrastructure constraints.
   - Cost constraints.
   - Security constraints.

6. Canonical boundaries
   - Which files are source of truth.
   - Which systems are admin skins only.
   - Which behavior is intentionally stubbed for now.

7. Deployment target
   - Where the result should eventually be reachable.
   - Which hostnames or subdomains are intended.
   - Which deploy plane owns the rollout.

8. Non-goals
   - What must not be implemented yet.
   - What should stay stubbed.

9. Model-routing sensitivities
   - Which slices are security-critical.
   - Which slices are heavy but routine.
   - Which slices are safe for base GPT execution.

## Yantresh Commerce values already known

The current project already satisfies much of the intake contract:

- Goal: multi-tenant ecommerce platform with shared runtime by default
- Current active lane: Phase 0 foundation work
- Canonical files: `docs/PRD.md`, `docs/schema.sql`, `docs/contracts.ts`
- Deploy plane: existing `yantresh-hub`
- Primary public domain family: `*.yantresh.com`
- Commerce isolation for MVP: Medusa sales channel + publishable key per tenant
- Non-goals for early phases: full Medusa checkout, full Payload admin, real plugin implementations

## Execution guardrails the router must enforce

These are execution rules, not product requirements:

1. Use the smallest meaningful slice.
2. Re-check Claude and OpenAI usage before major dispatches.
3. Normalize `% used` and `% left` before applying thresholds.
4. Wait for renewal instead of starting a likely-to-fail long run.
5. Treat the PRD roadmap phase exit test as the slice acceptance gate.
6. Keep early scaffolding foundation-only unless the PRD explicitly advances the phase.

## Correction split: PRD vs router

Belongs in the PRD:

- target architecture
- deploy model
- domain strategy
- security model
- tenancy model
- soft vs hard isolation path
- what MVP includes and excludes

Belongs in the router:

- quota checks
- model escalation rules
- milestone execution loop
- phase gating
- refusal to overbuild early phases
- when to pause and wait for reset windows

Belongs in both:

- canonical source-of-truth files
- non-goals for the current phase
- acceptance criteria for the current slice

## Visibility target

The router itself is not a web app. Its work becomes visible through the project.

For Yantresh Commerce, the intended visibility path is:

- public product/storefront: `*.yantresh.com` via `yantresh-hub`
- admin/control plane: `shop-admin.<domain>`
- commerce API: `shop-api.<domain>`

DuckDNS can still be used as a temporary operator endpoint, but it should not be
the primary product-facing target if `yantresh-hub` and `yantresh.com` are the
real deploy plane.

## Minimum ready-to-run checklist

Before trusting the router to drive a phase, verify:

- the active phase is named
- the exit test is explicit
- the canonical files are present
- current non-goals are explicit
- deployment ownership is explicit
- provider usage/status checks are working
- the repo has enough scaffold to implement the next slice

// ponytail: keep this file short; split into per-phase runbooks only if router
// behavior becomes ambiguous across multiple active products.
