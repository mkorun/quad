# Changelog

All notable changes to `quad` are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.3] — 2026-09-10

### Fixed

- **Wrapping a text node that follows an inline element could invent a rendered
  space.** When a text node was long enough to wrap and it followed an inline
  element's closing tag with no separating whitespace in the source
  (`<em>x</em>. Long sentence…`), the multi-line text path unconditionally
  prefixed a newline + indent — and `</em>\n  .` renders as `</em> .`, a space
  that was never in the document. Now the first unbroken run of characters
  stays attached to the current line (matching the single-line path and the
  existing "does not invent whitespace" guarantees for the non-wrapping cases);
  only the remainder wraps, at the block indent. Output stays idempotent.
  Three regression tests added.

## [0.1.2] — 2026-08-17

### Fixed

- README overstated the stray-`<` bailout ("only ever fires when what follows really is a tag") — two real gaps remained undocumented: a bare `<` + letter with no other tag later in the input never triggers the bailout (`a < b` → `a <b`), and an unquoted `>` before the next `<` is read as the tag's own closing `>`, fabricating a real `<b>` tag from plain prose (`a < b > c` → `a <b> c`). Both are now documented in Known Limitations, with the second one locked in by a new regression test.
- README's Worker examples pointed `new Worker(...)` directly at `worker.ts`, which plain Node (the package's stated `engines` requirement, ≥18) cannot execute without a loader. Examples now target the compiled `worker.mjs`, with a note on using `worker.ts` directly under Bun or a TS-loader setup.
- README claimed Cloudflare Workers and Deno Deploy are "RE2-based environments" — both actually run on V8, not RE2. Reworded to state what's actually true (quad's regexes use only RE2-compatible constructs, so there's no catastrophic-backtracking risk on any engine) without the incorrect runtime claim.

No code changes outside the new test.

## [0.1.1] — 2026-08-17

### Fixed

- README comparison table and prose had an inaccurate "Prettier: ~100 dependencies, ~2 MB installed" claim. Verified against the actual registry data: Prettier ships **0** runtime dependencies (fully bundled) but is **~9.7 MB** installed. js-beautify's installed footprint was also corrected from an unverified "~500 KB" to the real, measured `npm install` footprint (**~8.2 MB** across its 20 transitive packages). No code changes — documentation only.

## [0.1.0] — 2026-06-30

### Added

- `htmlFmt(html, options?)` — synchronous, zero-dependency HTML formatter
- Context-aware formatting: inline elements, raw blocks (`<script>`, `<style>`, `<pre>`, `<svg>`, `<textarea>`), void elements
- Long tag wrapping at `lineWrap` (default 120) with alignment to tag name
- Text content word-wrapping
- HTML normalization:
  - Void-element trailing slash removal (`<br />` → `<br>`)
  - Attribute quoting: unquoted values and single-quoted values → double-quoted (`charset=utf-8` → `charset="utf-8"`), with embedded `"` escaped and attribute-value whitespace preserved exactly
  - Tag name lowercasing (`<DIV>` → `<div>`), case-insensitive raw-content recognition (`<SCRIPT>`, `<Style>`, ...)
- Single-pass character-scanner tokenizer — quote-aware tag boundaries (`>` inside an attribute value doesn't end the tag), guaranteed forward progress (no pathological-input hangs), fully RE2-compatible
- `stripComments` option removes comments without gluing adjacent text together
- Idempotent: reprocessing quad's own output produces no further changes; `<script>`/`<style>` content remains opaque and is never reindented
- `HtmlFmtOptions` exported as a named type
- `indentation`, `lineWrap`, and `stripComments` options
- 138 tests: 130 unit tests + 8 differential/idempotency/extractor tests verifying semantic equality against js-beautify on real and synthetic HTML (`differential/`), plus a reproducible public benchmark (`bench/`)
