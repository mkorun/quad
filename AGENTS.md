# AGENTS.md

quad is an HTML formatter and normalizer: it changes markup only so far that a browser reads the same document
(README, "The contract").

## Read first

1. `README.md`: the contract (what quad may change), its options and its design scope.
2. `SECURITY.md` and `CHANGELOG.md`.
3. `differential/` and `oracle/` when a change touches what quad may rewrite.

## Principles

- **Look at how established tools solve it.** Before building a mechanism of your own, name the class of problem and
  how two or three leading tools of the same domain solve it; follow the proven pattern unless the difference is the
  point, and say which.
- **When fixes keep growing in one place, the design is wrong.** A second round of findings in the same place, or a fix
  that only works around a cause (a compatibility promise kept by a workaround is one), means stop, step back, and
  prefer the redesign that deletes code.
- **Readable code before line count.** A budget cuts scope, never clarity.
- **The gate guards against mistakes, not against circumvention.** `./check.sh` runs every check, the same in CI, for
  developers and for isolated runners; it changes no tracked file, and generated files are compared in a check mode
  that does not write.
- **A comparison with the previous release accepts a change;** it is not kept as a permanent gate.
- **This repository is public and holds nothing private:** no names, paths or texts from outside it, from the material
  a task brings along, or from the sites that use it.
- **Every platform counts:** Linux, macOS and Windows. Tests do not rely on timing (no tight time limits, no waiting
  for file-system events) or on how a system spells a path.
- **Reviews are by a different provider than the author.**

## How we work

- Human-owned files: `package.json`, `bun.lock`, `bunfig.toml`, `tsconfig*.json`, `.github/`, `AGENTS.md`, `CLAUDE.md`,
  `LICENSE`. Agents never change them; they propose a diff.
- `dist/` is built output that the gate compares: rebuild it with `bun run build` in every commit that changes the code.
- `./check.sh` passes before every commit (the browser oracle takes Chromium from `QUAD_CHROMIUM`). Run it on its own
  and check its exit status; never pipe or chain it.
- Every test file lives directly in `tests/` or `differential/` and ends in lowercase `.test.ts`; the gate stops at
  any other file named like a test (`.test.`, `_spec.` and the like, in any case, ignored directories included).
- The human versions, tags, publishes and pushes.
