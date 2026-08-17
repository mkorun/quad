# quad — HTML Formatter & Normalizer

Context-aware HTML formatter and normalizer for build pipelines. Takes raw HTML from template engines and produces consistently indented, HTML5-normalized markup, without altering DOM-relevant content (elements, attributes, text, comments).

**Synchronous. Zero dependencies. ESM-only. Formats and normalizes.** Most sync, zero-dependency HTML tools only format (pretty-print); quad also normalizes to HTML5 conventions (void-element syntax, attribute quoting, tag-name case) — see [Design scope](#design-scope) for how it compares to js-beautify and Prettier.

## Installation

```bash
bun add @mkorun/quad
# or
npm install @mkorun/quad
```

## Quick Start

```typescript
import htmlFmt from '@mkorun/quad'

const html = htmlFmt(rawHtml)
// with options:
const html = htmlFmt(rawHtml, { indentation: '  ', lineWrap: 120 })
```

## Options

```typescript
import type { HtmlFmtOptions } from '@mkorun/quad'

interface HtmlFmtOptions {
  indentation?: string    // indent string per level (default: '  ')
  lineWrap?: number       // max line length before attributes wrap (default: 120)
  stripComments?: boolean // remove HTML comments from output (default: false)
}
```

`stripComments: true` removes all `<!-- … -->` comments from the output. Useful for production builds where comments (build markers, template notes, etc.) should not be sent to the browser. Has no effect on `<script>`, `<style>`, or `<pre>` content.

---

## Design scope

quad is a **build-time formatter** — it sits inside a static site generator's build pipeline, not in a developer's editor.

The HTML quad formats is never hand-edited. There is no style discussion to settle among teammates. The sole goal is **readable output for humans who inspect build artifacts**.

This is a different problem than what Prettier and js-beautify solve:

| | quad | js-beautify | Prettier |
|--|:---------:|:-----------:|:--------:|
| Primary target | **Build pipeline** | Editor / Build | Editor / CI |
| Dependencies | **0** | 5 | ~100 |
| Installed size (unpacked) | **~58 KB** | ~500 KB | ~2 MB |
| API | **sync** | sync | async (Promise) |
| RE2-compatible | **Yes** | Yes | No |
| Text wrapping | Yes | Yes | No |
| HTML normalization | **Yes** | No | Partial |

js-beautify is a pure pretty-printer — it passes through whatever it receives, does not correct spec violations, and requires 5 dependencies. Prettier does normalize some constructs but requires async, ~100 dependencies, and is not designed for build-pipeline integration. quad is the only tool in this space that combines formatting with normalization in a sync, zero-dependency package.

**Minification** is out of scope — quad adds whitespace for readability, not removes it. For a production pipeline that needs minimal output, the two concerns compose cleanly:

```typescript
const formatted = htmlFmt(rawHtml)          // readable dev artifact
const minified  = htmlMin(htmlFmt(rawHtml)) // production output
```

For structurally valid input, quad's output remains valid HTML5 and works as input for HTML
minifiers. Malformed or unbalanced input is tolerated without hanging or throwing, but quad is a
formatter/normalizer, not an HTML validator or structural repair tool.

Two deliberate style choices that differ from Prettier and js-beautify:

**Closing block tags stay with their content.** When all content fits on one line, the closing tag stays at the end — `<p>Some <strong>bold</strong> text.</p>` rather than putting `</p>` on its own line. Compact and unambiguous.

**Text content is word-wrapped** at `lineWrap` (default 120 characters). Prettier leaves prose on a single line and lets browsers reflow; quad targets readability of the build artifact.

---

## Features

### Pretty formatting

Indents nested elements, collapses whitespace inside tags, normalizes self-closing syntax:

```html
<!-- input -->
<html><head><meta charset="utf-8"></head><body><p>Hello</p></body></html>

<!-- output -->
<html>

<head>
  <meta charset="utf-8">
</head>

<body>
  <p>Hello</p>
</body>

</html>
```

### Tag normalization

- Collapses whitespace inside tags: `<div  class="foo"  >` → `<div class="foo">`
- Void elements (`<br>`, `<img>`, `<input>`, `<meta>`, `<link>`, …) never increase indent depth; trailing slashes removed (see Normalization)

### Long tag wrapping

Tags with many attributes whose opening tag exceeds `lineWrap` (default 120 characters) are split across lines, aligned to the tag name:

```html
<div class="card card-highlighted extra-padding"
     data-tracking-id="header-nav-cta-x"
     data-analytics-category="navigation">
  Card content
</div>
```

### Inline elements

The following elements are treated as inline — no line break before them, no indentation increment, surrounding spaces preserved:

`a` `abbr` `b` `bdi` `bdo` `cite` `code` `data` `del` `dfn` `em` `i` `ins` `kbd` `mark` `q` `rb` `rp` `rt` `rtc` `ruby` `s` `samp` `small` `span` `strong` `sub` `sup` `time` `u` `var`

```html
<!-- input -->
<p>Some <em>italic</em> and <strong>bold</strong> text.</p>

<!-- output — inline elements preserved, spaces kept, no extra indentation -->
<p>Some <em>italic</em> and <strong>bold</strong> text.</p>
```

### Context-aware blocks

`<script>`, `<style>`, `<pre>`, `<textarea>`, and `<svg>` content is never tokenized as HTML — quad recognizes their opening tag (case-insensitively) and scans everything up to the matching closing tag as one opaque block, so embedded `<`, `>`, `/>`, or comment-like text inside is never misparsed. What happens to that block's *whitespace* differs by kind:

| Block | Content | Indentation |
|-------|---------|--------------|
| `<!-- ... -->` | Preserved verbatim | Placed on its own line at the current depth |
| `<script>...</script>` | Preserved verbatim, except one formatting boundary newline next to each tag | None — reindentation could change multi-line template-literal values |
| `<style>...</style>` | Preserved verbatim, with the same boundary-newline exception | None — CSS content is opaque |
| `<pre>...</pre>` | Preserved verbatim | None — inner tags, spaces, newlines untouched |
| `<textarea>...</textarea>` | Preserved verbatim | None — including all whitespace |
| `<svg>...</svg>` | Preserved verbatim | None — inner markup untouched |

`<pre>`, `<textarea>`, and `<svg>` inner content is preserved character-for-character. Script and
style content is also opaque and never reindented or reflowed; quad only normalizes one boundary
newline adjacent to each tag so formatting remains idempotent without accumulating blank lines.

### Normalization

HTML5 uses a different syntax than XHTML for void elements and attribute quoting. quad enforces HTML5 conventions:

**Trailing slash removal** — void elements do not use self-closing syntax in HTML5:

```html
<!-- input -->
<br /><img src="photo.jpg" /><meta charset="utf-8" />

<!-- output -->
<br><img src="photo.jpg"><meta charset="utf-8">
```

Non-void self-closing elements (e.g. SVG `<path />`) are left unchanged.

**Attribute quoting** — all attribute values are normalized to double quotes:

```html
<!-- input -->
<meta charset=utf-8>
<input type='text' maxlength=100>

<!-- output -->
<meta charset="utf-8">
<input type="text" maxlength="100">
```

Boolean attributes without values (`disabled`, `checked`, `required`) are left unchanged — they are already valid HTML5.

**Tag name lowercasing** — HTML5 tag names are case-insensitive, but lowercase is the convention:

```html
<!-- input -->
<DIV><P>Hello <STRONG>world</STRONG></P></DIV>

<!-- output -->
<div>
  <p>Hello <strong>world</strong></p>
</div>
```

Attribute names are intentionally not lowercased — SVG attributes like `viewBox` and `preserveAspectRatio` are case-sensitive and must be preserved verbatim.

### Fix tags

Whitespace artifacts from template rendering are cleaned up before formatting:

- `< div>` → `<div>` (space after `<`)
- `<div >` → `<div>` (space before `>`)

This tolerance only ever fires when what follows really is a tag: if a second, unquoted `<` turns up before the tag's own closing `>` (e.g. an unencoded `<` in prose like `a < b`), quad backs off and treats the original `<` as literal text instead of speculatively swallowing everything up to some unrelated later `>`. See [Known Limitations](#known-limitations).

---

## Performance

~3.3–3.6× faster than js-beautify on typical build output (measured on Bun v1.3.14; varies run to run within that range — reproduce it yourself rather than trust a single number):

```bash
git clone https://github.com/mkorun/quad
cd quad && bun install && bun run bench
```

`bun run bench` uses only fixtures shipped in this repo (no external or private content), so the comparison is reproducible by anyone who clones it. Representative run:

| Sample | quad | js-beautify | Factor |
|--------|----------:|------------:|-------:|
| hmd-testseite (14.5 KB) | 852 µs | 2475 µs | ×2.9 |
| feature-coverage (3.3 KB) | 140 µs | 796 µs | ×5.7 |
| edge-cases (1.7 KB) | 90 µs | 499 µs | ×5.5 |
| **avg** | **361 µs** | **1257 µs** | **×3.5** |

Prettier is intentionally not benchmarked — it has no synchronous API, carries ~100 transitive dependencies, and is not designed for build-pipeline use. js-beautify is the relevant comparison: same weight class, same build-friendly API. It has 5 dependencies and only formats — no normalization. quad does both and is still faster, with zero runtime dependencies.

**A fairness note on this number:** the two tools don't do exactly the same amount of work. js-beautify actively restructures `<script>`/`<style>`/`<svg>` content (re-formats JS/CSS, reindents nested SVG markup); quad deliberately treats that content as opaque and copies it verbatim (see [Context-aware blocks](#context-aware-blocks)). On fixtures with a lot of embedded script/style/SVG, that gives quad a work-based head start that has nothing to do with tokenizer speed. Measuring the same fixtures with those blocks emptied out narrows the factor to **~3.1–3.7×** — still a real, consistent advantage, just not quite as dramatic as the headline number on documents that happen to be light on embedded script/style/SVG.

---

## Known Limitations

- **Inline elements without surrounding text** (`<p><em>…</em></p>`) are placed directly after the opening block tag — no `<p>\n  <em>`. Inline elements do not increment the indent counter.
- **Whitespace-sensitive element classification follows HTML defaults, not page CSS.** quad cannot know that a stylesheet changes an element from inline to block (or vice versa), so adjacency preservation follows the element's normal HTML rendering category. Source whitespace is never inferred from CSS.
- **Unbalanced HTML** (more closing than opening tags) is caught via `Math.max(0, indentationCount - 1)` — no crash, but indentation may be off at the affected point. Typically occurs with Markdown-generated output (e.g. `<dl><dt><dd>` on one line).
- **Nested same-name raw blocks** (e.g. a string literal containing the text `</script>` inside a `<script>` element) end the block at that first occurrence — this matches how browsers actually tokenize HTML (`<script>` content is not parsed for further tags, the first literal `</script>` always ends it), so it's spec-correct behavior, not a quad-specific quirk.
- **Comment contents are not reformatted.** A multi-line `<!-- ... -->` block is emitted as one unit with its original internal line breaks and indentation kept exactly as written. Comments between inline content stay attached so they cannot introduce or remove visible word spacing; comments in block layout may be repositioned with the surrounding indentation.
- **`<script>`/`<style>`/`<svg>` inner content is excluded from the automated comparison against js-beautify** (see `differential/`) — js-beautify actively restructures JS/CSS and reformats SVG markup, while quad deliberately treats these blocks as opaque. Element structure and attributes are still compared; quad's own raw-content preservation contract is covered directly by unit tests.
- **An unencoded `<` immediately followed by a letter, with no other tag anywhere in the rest of the input, still gets misread as an unterminated tag** (e.g. the standalone string `a < b` becomes `a <b`). The stray-`<` bailout (see [Fix tags](#fix-tags)) only triggers when a *second* `<` shows up before the first one's `>` — with nothing else in the document, there's nothing to trigger it. Real HTML documents always have further markup after any given point, so this is a theoretical edge case for content quad actually formats, not something observed in practice.

---

## Untrusted input

quad is designed for **build-pipeline use** — it formats HTML that you generated yourself from your own templates. It is synchronous and has no timeout: a pathological input could theoretically block the thread indefinitely. (quad's own lexer guarantees forward progress on every character — no known input hangs quad itself — but "no known input" is not a safety guarantee for content you don't control.)

If you need to format HTML from an untrusted source (user-submitted content, scraped pages, third-party APIs), run quad inside a Worker thread with a timeout. quad is ESM-only, so the worker needs its own file — `require()` on an ESM package inside an `eval: true` Worker (a common pattern for CJS packages) will not work here:

```typescript
// worker.ts — a real, separate file, imported by the Worker below
import { parentPort, workerData } from 'node:worker_threads'
import htmlFmt from '@mkorun/quad'

parentPort!.postMessage(htmlFmt(workerData))
```

```typescript
// main.ts
import { Worker } from 'node:worker_threads'

function htmlFmtSafe(html: string, timeoutMs = 5000): Promise<string> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { workerData: html })

    const timer = setTimeout(() => {
      worker.terminate()
      reject(new Error('htmlFmt timed out'))
    }, timeoutMs)

    worker.on('message', result => { clearTimeout(timer); resolve(result) })
    worker.on('error', err => { clearTimeout(timer); reject(err) })
  })
}
```

For high-throughput scenarios, use a Worker pool (e.g. [piscina](https://github.com/piscinajs/piscina)) to avoid the per-call thread-start overhead (~5–10 ms):

```typescript
// worker.ts
import htmlFmt from '@mkorun/quad'
export default (html: string) => htmlFmt(html)
```

```typescript
// main.ts
import Piscina from 'piscina'

const pool = new Piscina({ filename: new URL('./worker.ts', import.meta.url).pathname })
const formatted = await pool.run(untrustedHtml)
```

A persistent pool reduces per-call overhead to ~0.5–1 ms (IPC serialization only). Note that the async API is a consequence of thread isolation — if your pipeline is entirely trusted, the sync API remains preferable.

---

## RE2 compatibility

quad is fully RE2-compatible, safe to use in RE2-based environments such as Cloudflare Workers and Deno Deploy. Tokenization itself is a plain character/index scanner — not regex-based at all, so it has no RE2 exposure by construction. The handful of remaining regexes (tab replacement, a dynamically-built `</tagname\s*>` raw-content terminator, a couple of literal-character replacements) use only character classes and anchors — no lookaheads, lookbehinds, or backreferences anywhere in the codebase.

---

## Tests

```bash
bun test   # 138 tests: 130 unit tests + 8 differential/idempotency/extractor tests
```

| Group | Coverage |
|-------|----------|
| basic formatting | Indentation, structure, custom indent string |
| void elements | `br`, `img`, `input`, `meta`, self-closing |
| HTML comments | Content preserved, no spurious whitespace around `-->` |
| stripComments | Comment removal without gluing adjacent words together |
| script/style preservation | JS/CSS opaque and not reindented; template-literal content unchanged |
| textarea preservation | Whitespace untouched, embedded tag-like text stays literal |
| long tag wrapping | Attribute wrapping at `lineWrap` |
| tag normalization | Whitespace collapse, self-closing syntax |
| **normalization** | **Trailing slash removal, attribute quoting, tag name lowercasing** |
| indentation clamp | No crash on unbalanced HTML |
| multiline text content | Long text wraps, short text stays inline |
| pre preservation | Content including inner tags preserved exactly |
| svg preservation | Inner markup verbatim, self-closing children, no indent increment |
| inline/phrasing elements | Spaces preserved around inline, void, replaced, and custom elements |
| blank line fixes | No spurious blank lines before `<hr>`, `<img>`, after `<script>` |
| **quote-aware attribute parsing** | **`>`/quotes inside attribute values, no infinite loop on a stray `/`** |
| **case-insensitive raw content** | **`<SCRIPT>`, `<Style>`, mixed case — still recognized as raw content** |
| leading/trailing text | Text-only input, text outside the outermost tag |
| doctype | Recognized as a tag (any case), not absorbed into surrounding text |
| malformed input | Missing `>`, missing closing tags, unterminated comments/raw blocks — no hang, no throw |
| crash resistance | Real article HTML from Markdown output, plus full-document idempotency |
| **semantic equality vs. js-beautify** | **Same elements/attributes/text/comments — see [`differential/`](./differential); layout differences excluded on purpose** |
| **namespaced tag names** | **`<svg:svg>` doesn't get truncated at `:` and mistaken for raw content** |
| **whitespace before a block-ish sensitive tag** | **`button`, `label`, `svg`, custom elements — source space preserved without inventing one at a layout-only block boundary** |
| **unencoded "<" in prose** | **`a < b` stays literal text instead of being misread as a tag and swallowing the rest of the document; genuine `< div>`/`</ div>` template-whitespace normalization still works** |

Bold rows were added after external pre-publish reviews found real bugs: the first found regressions in the previous regex-based tokenizer (quote-unaware `>` handling, the infinite loop, case-sensitive raw-content detection); a second review of the rewritten lexer found a namespaced-tag-name truncation bug and a whitespace-loss bug before non-inline sensitive tags. Each row's rewrite is what the corresponding test group now guards against regressing.

---

## Part of the hadley ecosystem

- [@mkorun/lima](https://www.npmjs.com/package/@mkorun/lima) — frontmatter parser
- [@mkorun/galley](https://www.npmjs.com/package/@mkorun/galley) — template engine
- [@mkorun/quad](https://www.npmjs.com/package/@mkorun/quad) — HTML formatter & normalizer

---

## License

ISC
