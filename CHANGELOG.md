# Changelog

All notable changes to `quad` are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.2.0] — 2026-11-20

quad now has a contract (README "The contract"): the output is the input with the spelling of regular tags normalized,
with whitespace changed only where a browser renders the same, and with comments removed on request. The lexer and
the layout are rewritten after it; a browser checks it in the gate. The API is unchanged. Every item below changes
output against 0.1.5.

### Changed

- **Every element that is not in the block list is inline**, also `label`, `button`, `input`, `img`, `select`,
  `picture`, `source`, `video`, `audio`, `canvas`, `object`, `svg`, `math`, `textarea`, `br` and unknown or custom
  elements. They stay in the line of their text, and quad adds no whitespace before, after or inside them. A lone
  `<img>` in a `<div>` is written on the line of the `<div>`; `<br>` no longer starts a line.
- **Whitespace between inline content is kept in kind.** A line break of the source stays a line break, also next
  to an inline element, where 0.1.5 made it a space (`a <em>b</em>⏎c`). A space becomes a line break only where the
  line would pass `lineWrap`.
- **A block element is written on one line only if its content has no line break and fits with both tags.**
  Otherwise the content goes on lines of its own between the tags, so a paragraph that 0.1.5 began on the line of
  `<p>` now begins on the next. A closing block tag is no longer glued to the one before it (`</div></div>`).
- **`script` and `style` content is copied byte for byte.** The line break 0.1.5 wrote after the start tag and
  before the end tag is gone, and `</script>` is no longer indented. A script or style element inside text gets no
  whitespace around it.
- **`title` is verbatim**, like `textarea`: its content is text, not markup, and is no longer trimmed.
- **`xmp`, `iframe`, `noembed`, `noframes`, `noscript`, `listing` and `math` have verbatim content**; `plaintext` runs
  to the end of the input.
- **A tag that is not regular is copied byte for byte** (an attribute without whitespace before it, a quote outside a
  value, `/` not directly before `>`, attributes on an end tag, …). The repair of 0.1.4, `title=a"b` →
  `title="a&quot;b"`, is gone, and so is the reading of a second `<` inside a tag as a new tag: a tag ends at its
  first `>` outside a value, as in a browser.
- **Input that ends inside a tag, a comment or a verbatim element is copied from that construct's `<` on**, without
  added whitespace.
- **The left margin stops at `lineWrap / 2`.** Deeper nesting (30 levels with the defaults) no longer shows in the
  indentation, and the output has at most `input · (lineWrap / 4 + 7) + 2 · lineWrap` characters.
- **Void elements wrap their attributes too** when the tag is longer than `lineWrap` (`meta`, `link`, `img`).
- **A form feed in text is a character**, not whitespace.
- **The output has no whitespace at its start, and at its end only what the contract keeps:** a line break where
  the input ends in a block element that holds nothing but whitespace (`<p> ` → `<p>⏎`), and the end of input that
  is copied because it ends inside a construct (`<pre>⏎`).

### Fixed

- Two uncertain boundaries now return the entire input unchanged, including with `stripComments` and before
  that boundary: an end tag of an open outer verbatim region while an inner region is open; and document tags
  misplaced by the token check (`<head>` or `</head>` after body content, `<body>` after body content, text or a
  tag other than `</html>` after `</body>`). Previously an over-long foreign region could make formatting resume
  inside a later script, and misplaced document tags could add rendered spaces. This is no tree repair and is
  exact in neither direction: some properly nested integration-point content, and `<template>` or `<noscript>`
  before `<body>` with head tags omitted, stay unchanged; misnested input it misses stays outside the contract.
- Spaces next to encoded U+200B or between numeric wide-character references no longer wrap into line breaks.
  Numeric references and the common names `lt`, `gt`, `amp`, `quot`, `apos`, `nbsp` inform this check; other names,
  including the five names for U+200B, conservatively keep the space. A decoded space, tab, LF, CR or FF at a
  word's edge also keeps the neighbouring space, including across inline tags.

- Text in `<title>` that looks like a tag was formatted as markup (Q-1).
- Wrapping put whitespace inside `<label>`, `<button>`, `<picture>`, `<video>`, `<select>`, `<math>` and custom
  elements; the rendered text could change (Q-2, N-5).
- A nested `<svg>` or `<pre>` ended the verbatim content of the outer one; whitespace after it was collapsed (Q-3,
  N-3). So did a `</pre>` inside an `<svg>` or `<math>` that stands in `<pre>`, and a `</svg>` or `</math>` in raw
  text inside an integration point, as in a `<textarea>` in `<foreignObject>` (R-3, R-4). Such an inner element now
  hides outer end tags; a visible crossed region preserves the entire input. Input that ends inside a region is
  copied from the outer region's `<` on.
- `stripComments` took `<!-->` for the start of a comment and removed what followed it (Q-4); it left a space behind
  a removed comment at the end of a line; and removing a comment could create a tag or a character reference
  (`a<<!--c-->/p>`, `&am<!--c-->p;`): such a comment now stays (N-7).
- An unterminated `<pre>`, `<textarea>`, `<script>` or `<style>` gained whitespace at the end of the input (Q-5).
- Malformed tags were rewritten into other tags: `<style <d>`, a no-break space after the tag name, `<a =>`, quotes
  outside a value, `<! `, `<? ` and `</ ` at the end of the input, `<script/>` (Q-6).
- Formatting twice gave another result than formatting once: long words, `\r\r\n`, `<html` without `>`,
  `<picture>` in `<figure>`, `<noscript>` (Q-7, N-12).
- The output grew with the square of the nesting depth, and with tag-name length times attributes (Q-8, N-13).
- A tab or line break in an attribute value became a space (N-1).
- `<a href=x/>` lost the `/` of its value (N-2).
- A script or style element inside text got line breaks around it, which render as spaces (N-4).
- The content of a script got a line break at both ends, also JSON (N-6).
- `<div> </div>` became `<div></div>` (N-8).
- A space after `<wbr>` or next to U+200B could become a line break, which a browser renders as nothing (N-10).
- Non-ASCII letters of a tag name were lowercased, which names another element (N-11).
- `<script><!--<script></script>--></script>`: the first `</script>` ended the script; a browser ends it at the
  second.

### Added

- The gate's properties on generated input (`tests/properties.test.ts`), a test per finding
  (`tests/findings.test.ts`) and a browser oracle (`oracle/`, run by `check.sh`, Chromium from `QUAD_CHROMIUM`).

## [0.1.5] — 2026-11-10

### Fixed

- **Wrapping a text node that runs into an inline element could invent a rendered space.** A long text that ended
  without whitespace in the source before an inline opening tag (`(<a href="…">`, `pre<em>`) was ended with a newline,
  which renders as a space: `( note` instead of `(note`. 0.1.3 kept a text's start attached to an inline element before
  it; its end now stays attached to an inline element after it. `<br>` keeps its structural line break. Output stays
  idempotent. Three regression tests added.

## [0.1.4] — 2026-10-31

### Fixed

- **`< b>` and `</ p>` became a tag and an end tag.** A browser reads them as text and as a comment, so the formatter
  turned text into markup and could end an element early. They now stay as they are. This drops the tolerance for
  `< div>` from template whitespace.
- **Whitespace around `=` emptied the value.** `<p title = "x data-b=1">` gave `title=""` and an attribute `data-b`.
- **A quote in an unquoted value ended it.** `<p title=a"data-b="1>` gave two attributes; the quote is now `&quot;`.

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
