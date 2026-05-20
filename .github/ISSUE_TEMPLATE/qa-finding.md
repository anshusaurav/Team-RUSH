---
name: QA finding
about: A bug or behaviour issue surfaced during backend testing.
title: "[QA] "
labels: qa
assignees: ''
---

## Endpoint or behaviour under test
<!-- /api/... or a service. -->

## What I tried
<!-- The curl / request you ran or the action that triggered it. -->

## What happened
<!-- Response, log line, or observed misbehaviour. Paste exact output. -->

## Expected
<!-- What you thought should happen. -->

## Severity
- [ ] **Blocker** — endpoint 5xx, data corruption, crash on boot
- [ ] **High** — wrong values returned, broken in one common case
- [ ] **Medium** — edge case, slow response, log spam
- [ ] **Low** — cosmetic / message wording
