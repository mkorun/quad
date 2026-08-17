# Changelog

All notable changes to `quad` are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
