# Philosophy

Shiploop optimizes the cost of moving one coherent idea into trusted history. It does not optimize
commit count.

## What transfers well

The durable parts of high-throughput agentic development are structural:

- Tasks small enough to fit one clean context.
- Parallel work divided by blast radius.
- Fast local evidence before integration.
- Mechanical checks delegated to tools.
- Human attention concentrated on irreversible and high-authority changes.
- History organized as logical, reviewable units.
- Release work expressed as repeatable commands instead of memory.

These ideas work across agents, languages, editors, and hosting platforms.

## What does not transfer automatically

Direct-to-main development is effective in some maintainer-owned repositories and reckless in
others. The same is true of autonomous command execution, test selection, forward fixes, and
post-implementation testing. Shiploop exposes these as repository policy instead of pretending
that one person's risk model is universal.

## Local proof is evidence, not ceremony

A proof receipt answers a narrow question: did these configured commands pass for this exact diff?
The receipt is invalidated by any file change. It says nothing about checks that were not configured,
production behavior, or requirements that were never written down.

CI remains useful for clean environments, platform matrices, slow suites, supply-chain controls,
and protected secrets. Local proof shortens the feedback loop; it does not replace aggregate gates.

## Risk-aware review

Review effort should track consequence. Formatting and generated adapters can often be checked
mechanically. Authentication, authorization, money, user data, migrations, concurrency, deployment,
and signing deserve slow human attention even when tests pass.

The default patterns are deliberately conservative and incomplete. Every repository must encode its
own dangerous surfaces in `.shiploop/config.yml`.

## Agent independence

Shiploop coordinates artifacts and evidence rather than agent sessions. A task brief is Markdown,
a proof step is a shell command, a review is based on Git paths, and a commit is ordinary Git. This
keeps the workflow usable when models, tools, and pricing change.
