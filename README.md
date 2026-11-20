<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/mkorun/quad/main/assets/logo-dark.svg">
    <img src="https://raw.githubusercontent.com/mkorun/quad/main/assets/logo-light.svg" alt="" width="96" height="96">
  </picture>
</p>

# quad — HTML Formatter & Normalizer

Context-aware HTML formatter and normalizer for build pipelines. Takes raw HTML from template engines and produces consistently indented, HTML5-normalized markup that a browser reads as the same document: the DOM is equal up to whitespace that does not render, and the rendered text is equal. [The contract](#the-contract) says exactly what may change.

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
  lineWrap?: number       // line length at which text and attributes wrap (default: 120)
  stripComments?: boolean // remove HTML comments from output (default: false)
}
```

`stripComments: true` removes the `<!-- … -->` comments from the output. Useful for production builds where comments (build markers, template notes, etc.) should not be sent to the browser. It leaves verbatim content alone (`<script>`, `<style>`, `<pre>`, `<svg>`, …) and keeps the rare comment whose removal would create markup; see [C: `stripComments`](#c-stripcomments).

---

## Design scope

quad is a **build-time formatter** — it sits inside a static site generator's build pipeline, not in a developer's editor.

The HTML quad formats is never hand-edited. There is no style discussion to settle among teammates. The sole goal is **readable output for humans who inspect build artifacts**.

This is a different problem than what Prettier and js-beautify solve:

| | quad | js-beautify | Prettier |
|--|:---------:|:-----------:|:--------:|
| Primary target | **Build pipeline** | Editor / Build | Editor / CI |
| Dependencies (package.json) | **0** | 5 | 0 |
| `npm install` footprint | **~61 KB** | ~8.2 MB (20 packages) | ~9.7 MB |
| API | **sync** | sync | async (Promise) |
| RE2-compatible | **Yes** | Yes | No |
| Text wrapping | Yes | Yes | No |
| HTML normalization | **Yes** | No | Partial |

Dependency *count* isn't the whole story: Prettier lists zero runtime dependencies (it bundles everything internally) but is still ~9.7 MB on disk once installed; js-beautify's 5 direct dependencies pull in 20 packages and ~8.2 MB transitively. Numbers are actual `npm install` output in an empty project, not each package's own tarball size — reproduce with `mkdir t && cd t && npm init -y && npm install <package> && du -sh node_modules`. js-beautify is a pure pretty-printer — it passes through whatever it receives and does not correct spec violations. Prettier does normalize some constructs but requires async and is not designed for build-pipeline integration. quad is the only tool in this space that combines formatting with normalization in a sync, zero-dependency, sub-100-KB package.

**Minification** is out of scope — quad adds whitespace for readability, not removes it. For a production pipeline that needs minimal output, the two concerns compose cleanly:

```typescript
const formatted = htmlFmt(rawHtml)          // readable dev artifact
const minified  = htmlMin(htmlFmt(rawHtml)) // production output
```

For structurally valid input, quad's output remains valid HTML5 and works as input for HTML
minifiers. Malformed or unbalanced input is tolerated without hanging or throwing, but quad is a
formatter/normalizer, not an HTML validator or structural repair tool: what it cannot read as a
regular tag it copies, and it repairs nothing.

Two deliberate style choices that differ from Prettier and js-beautify:

**Closing block tags stay with their content.** When all content fits on one line with both tags, the closing tag stays at the end — `<p>Some <strong>bold</strong> text.</p>` rather than putting `</p>` on its own line. Compact and unambiguous.

**Text content is word-wrapped** at `lineWrap` (default 120 characters). Prettier leaves prose on a single line and lets browsers reflow; quad targets readability of the build artifact.

---

## The contract

quad's output is its input with three kinds of change and no other:

- **T**: inside a *regular* tag, the spelling of the tag;
- **W**: whitespace between tokens, where a browser with the HTML standard's default stylesheet renders the same with
  or without it;
- **C**: with `stripComments`, comments are removed.

Every other byte is copied: text characters, attribute names and values, comments, and everything inside verbatim
content.

No formatter that indents can leave the DOM untouched, since every line break it adds is a text node. What quad
promises, and what its tests check in a browser, is: **the DOM is equal up to whitespace that does not render, and the
rendered text is equal.** The reference is the default stylesheet. CSS of the page that changes `display` or
`white-space` is outside the contract.

### How quad reads

quad reads tokens as the HTML tokenizer does, never as the author may have meant them.

- `<` before an ASCII letter starts a start tag, `</` before a letter an end tag.
- `<!--` starts a comment that ends at `-->` or `--!>`; `<!-->` and `<!--->` are whole comments.
- `<!doctype` (any case) runs to the first `>`.
- `<!…`, `<?…` and `</` before anything but a letter run to the first `>`, as the comments a browser makes of them
  (of `<?x …>` Chromium 156 makes a processing instruction, with the same end).
- Any other `<` is text. Encode a `<` in prose as `&lt;`: `a <b > c` holds a tag for quad and for a browser alike.
- A tag name runs to whitespace, `/` or `>`. A quote opens a value only after `=`.
- Whitespace in a tag is space, tab, line feed, form feed and carriage return. In text the form feed is a character.

Tree construction is not part of it: quad does not know which start tag ends which element or where a browser
moves misnested content. See [Known limitations](#known-limitations).

### T: the spelling of a tag

A tag is **regular** when all of these hold:

- its name is ASCII letters, digits, `-` and `:`;
- each attribute is preceded by whitespace;
- attribute names contain no `"`, `'` or `<` and do not start with `=`;
- each value is `"…"`, `'…'`, or unquoted, non-empty and without `"`, `'`, `<`, `=` and `` ` ``;
- `/` occurs only directly before `>`;
- an end tag has no attributes and no `/`.

In a regular tag quad

- lowercases the tag name: `<DIV>` → `<div>`;
- writes one space between attributes, or a line break and alignment in a tag longer than `lineWrap`;
- drops whitespace around `=` and before `>`: `<div  class = "a"  >` → `<div class="a">`;
- writes every value in double quotes, with `"` → `&quot;` in a value that was in single quotes:
  `<input type='text' maxlength=100>` → `<input type="text" maxlength="100">`;
- drops the `/` of a void element and writes ` />` elsewhere: `<br />` → `<br>`, `<path d="M0 0"/>` → `<path d="M0 0" />`.

Attribute names and values are never touched: not their case (`viewBox`), not a tab or line break inside a value. An
attribute without a value stays without one.

A tag that is not regular is copied byte for byte, and its name still decides its category: `<p title=a"b>`,
`<a href="x"class="y">` and `<br/ >` come out as they went in.

`/>` closes an element only on `svg` and `math`. On any other element that is not void a browser ignores it, and so
does quad: `<script/>` opens a script.

### W: whitespace between tokens

Between two neighbouring tokens there is nothing, a space (whitespace without a line break) or a line break.

- **Free**: directly next to a block tag, and at the start and the end of the input, quad creates, removes and
  reshapes whitespace. Comments, a doctype and whole metadata elements between that place and the block tag do not
  count, since they render nothing. Emptiness is kept: an element without content gets none (`<div></div>` stays,
  however long its start tag), and content that is only whitespace stays whitespace (`<div> </div>` becomes
  `<div>`, a line break, `</div>`).
- **Kept**: everywhere else
  - nothing stays nothing;
  - a line break stays a line break, indented anew;
  - a space stays a space, or becomes a line break where the line would pass `lineWrap`. It stays a space after
    `<wbr>`, next to U+200B and between two characters from U+1100 on (among them the East Asian wide ones), where a
    browser may render a line break as nothing. Numeric character references and the common names `lt`, `gt`,
    `amp`, `quot`, `apos` and `nbsp` count as their decoded characters. A semicolon is optional only for `lt`,
    `gt`, `amp`, `quot`, `nbsp`. Next to any other named reference quad conservatively keeps the space, including
    the five names for U+200B. An encoded space, tab, LF, CR or FF at a word's edge also keeps the neighbouring
    space: it collapses with that space, so the character beyond it may decide how a line break renders.
- **Verbatim content**: nothing changes.

`lineWrap` is a target, not a bound: a line without a place to break stays long.

### The elements

Every name that is not listed is **inline**, also unknown and custom elements.

| Category | Elements | Around its tags | Content |
|---|---|---|---|
| Block | `address article aside blockquote body caption center col colgroup dd details dialog dir div dl dt fieldset figcaption figure footer form frame frameset h1`–`h6 head header hgroup hr html legend li main menu nav ol optgroup option p search section summary table tbody td tfoot th thead tr ul` | free | formatted |
| Inline (default) | all others: `a span code em label button input img select picture source video audio canvas object slot template ruby rt rp br wbr`, `my-element`, … | kept | formatted |
| Metadata | `base link meta script style title` | kept; a line of its own where the whitespace is free or there is a space | see the next rows |
| Escapable raw text | `title`, `textarea` | by its own category (`textarea` is inline) | verbatim up to `</name` before whitespace, `/` or `>` |
| Raw text | `script style xmp iframe noembed noframes noscript`; `plaintext` to the end of the input | by its own category (`xmp` and `plaintext` are blocks, the others inline) | verbatim, with the same end; in `script`, a `</script>` between `<!--`, `<script` and `-->` does not end it, as in a browser |
| `pre`, `listing` | | free (block) | verbatim up to the matching end tag, counting nested elements of the same name; the line break after the start tag is neither added nor removed |
| Foreign | `svg`, `math` | kept (inline) | verbatim up to the matching end tag, read as foreign content (below); the start tag is rewritten by T, nothing inside is |
| Void | `area base br col embed hr img input link meta source track wbr` | by its own category | none |
| Comment, doctype | | kept; neither counts where whitespace is free | verbatim; of a doctype quad lowercases the word `doctype` |

The end of verbatim content is found with the same reader: a comment, a quoted value or raw text inside hides a
`</pre>` or `</svg>`. Inside, quad reads in one of the two ways a browser does:

- **as HTML** in `pre` and `listing`: raw text (`textarea`, `script`, …) hides everything up to its own end tag, and
  an `svg` or `math` holds foreign content;
- **as foreign content** in `svg` and `math`: there is no raw text, `/>` closes an element, and the content of an
  integration point is HTML again. These are `foreignObject`, `desc` and `title` of SVG and `mi`, `mo`, `mn`, `ms`,
  `mtext` and `annotation-xml` of MathML. `<![CDATA[…]]>` is skipped everywhere inside `svg` and `math`.

quad finds the end of verbatim content and the place of `<head>` and `<body>` from tokens, without the tree a
browser builds. Where it sees that the two can disagree, it returns the whole input unchanged: no tag
normalization, whitespace formatting or comment removal, also before that place, also with `stripComments`.
It sees two cases:

- **A crossed region.** Inside verbatim content, an end tag that names an open outer region while an inner region
  is open: `<pre><svg></pre>`. End tags in comments, quoted values, CDATA sections and raw text are not seen.
- **A misplaced document tag.** `<head>` or `</head>` after body content; `<body>` after body content; after
  `</body>`, text or any tag but `</html>`. Body content is `<body>`, text outside `<head>…</head>`, and a start tag
  outside it other than `<html>`, `<head>`, `base`, `link`, `meta`, `script`, `style` and `title`. A leading U+FEFF
  byte order mark is not body content and stays at the start of the formatted output.

An over-long verbatim region can make what follows it format in the wrong place. This check is no tree repair
and is exact in neither direction. It keeps some properly nested input unchanged: an element in an integration
point with the name of an open outer region (`<pre><svg><foreignObject><pre>`), and `<template>` or `<noscript>`
before `<body>` where the head tags are omitted. Misnested input it does not see stays outside the contract;
see [Known limitations](#known-limitations).

### Input that ends early

If the input ends inside a tag, a comment, a raw text or verbatim element, or after `<plaintext>`, the rest from that
construct's `<` is copied unchanged, and no option touches it. quad does not report this.

### C: `stripComments`

`stripComments: true` removes every terminated `<!--…-->` comment outside verbatim content. The whitespace on both
sides becomes one gap, so the result is the same as formatting the input without those comments.

A comment stays when it comes directly after a `<`, or after `&` followed by letters, digits or `#`, and text comes
directly after it: without it `a<<!--c-->/p>` would become markup and `&am<!--c-->p;` a character reference.

Bogus comments (`<!…>`, `</ …>`), `<?…>` markup (exposed as a processing instruction by some browsers), and
comments in verbatim content are never removed.

### Properties

- **Total.** No input throws.
- **Idempotent.** Formatting the output again gives the output.
- **Bounded output.** The left margin of a line, indentation and alignment, is at most `lineWrap / 2`, so the output
  has at most `input · (lineWrap / 4 + 7) + 2 · lineWrap` characters. Beyond that depth (30 levels with the defaults)
  nesting no longer shows in the indentation.
- **Linear time.** The reader never backs up: a search either finds its end or ends formatting, with the rest of the
  input copied.

## Layout

What quad does with the whitespace that is free is its style, not part of the contract.

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

- A block tag goes on a line of its own, and what it contains one level deeper. `html` does not indent; a blank line
  follows `<html>`, `</head>` and `</body>`.
- A block element whose content fits on the line with both tags is written on one line:
  `<p>Some <em>italic</em> and <strong>bold</strong> text.</p>`, `<div><img src="a.png"></div>`.
- Otherwise the inline content between two block tags becomes lines, broken where the source has line breaks and
  where a line would pass `lineWrap`.
- Metadata elements and the doctype take a line of their own where the contract allows it.
- A start tag longer than `lineWrap` (default 120) wraps its attributes, aligned to the first:

```html
<div class="card card-highlighted extra-padding"
     data-tracking-id="header-nav-cta-x"
     data-analytics-category="navigation"
     data-more="1">
  Card content
</div>
```

---

## Performance

About 6–9× faster than js-beautify on the fixtures of this repository (measured on Bun v1.4.4; it varies with the machine and the run, so reproduce it rather than trust a single number):

```bash
git clone https://github.com/mkorun/quad
cd quad && bun install && bun run bench
```

`bun run bench` uses only fixtures shipped in this repo (no external or private content), so the comparison is reproducible by anyone who clones it. Mean of 8 runs:

| Sample | quad | js-beautify | Factor |
|--------|----------:|------------:|-------:|
| hmd-testseite (37.9 KB) | 513 µs | 2481 µs | ×4.8 |
| feature-coverage (3.3 KB) | 65 µs | 859 µs | ×13.3 |
| edge-cases (1.7 KB) | 35 µs | 562 µs | ×16.3 |
| **avg** | **204 µs** | **1301 µs** | **×6.4** |

Prettier is intentionally not benchmarked — it has no synchronous API, ships ~9.7 MB of bundled parser code, and is not designed for build-pipeline use. js-beautify is the relevant comparison: same weight class, same build-friendly API. It has 5 dependencies and only formats — no normalization. quad does both and is still faster, at a fraction of the footprint of either.

**A fairness note on this number:** the two tools don't do exactly the same amount of work. js-beautify actively restructures `<script>`/`<style>`/`<svg>` content (re-formats JS/CSS, reindents nested SVG markup); quad copies that content verbatim (see [The elements](#the-elements)). On fixtures with a lot of embedded script/style/SVG, that gives quad a work-based head start that has nothing to do with tokenizer speed.

---

## Known limitations

- **quad knows an element by its name, not by the tree a browser builds.** The oracle (see [Tests](#tests)) keeps a
  case for each of these, where a browser sees a difference:
  - The default stylesheet hides an element with the attribute `hidden`, an element with the attribute `popover`
    until it is opened, and a `<dialog>` without `open`. quad still puts the tags of such a block element on lines of
    their own; between two pieces of text that whitespace renders (`b<div hidden>…</div>c`, `b<div popover>…</div>c`).
  - An element without content whose end tag is left out gets whitespace: in `<li><li>b</li>` the second start tag ends
    the first element for a browser, while quad opens a level, and the first `li` is no longer `:empty`.
  - Whitespace after `</body>` is content of `<body>` for a browser, so an empty `<body></body>` before `</html>` is
    no longer `:empty`.
  - At the end of the input whitespace is free also inside an inline element that no end tag closed; the text of that
    element loses it. Nothing renders differently.
- **Misnested input.** Where a browser repairs the tree (a stray `</div>`, text directly in `<table>`, `<tr>` outside a
  table, other misplaced document tags), a block tag may not make a block,
  and whitespace quad wrote next to it can render. quad still neither throws nor hangs, formats the same twice and
  keeps the output bound. More end tags than start tags leave the indentation at the left edge.
- **Block elements in `<ruby>`.** Flow content in `<ruby>` is not conforming, but a browser keeps it there: a block
  element gets whitespace before and after it that renders (`<ruby>漢<div>x</div><rt>kan</rt></ruby>`).
- **Classification follows the default stylesheet, not page CSS.** quad cannot know that a stylesheet makes an inline
  element a block or sets `white-space: pre`.
- **The end of verbatim content is found without the tree a browser builds.**
  - Visible outer end tags crossed by an inner region return the entire input unchanged under the
    uncertain-boundary rule above. Copying only an over-long region is unsafe: formatting after
    its endpoint can change a later script or add rendered whitespace.
  - Verbatim content can be shorter where misnested input makes a browser ignore an end tag that quad takes: an HTML
    element left open in an integration point (`<foreignObject><p>a</foreignObject>`), a `</pre>` inside an
    `<object>` or a table that stands in the `<pre>`, raw text behind a tag at which a browser leaves foreign content
    (`<svg><p><textarea>`). What follows is then formatted.
  - An `<annotation-xml>` is read as HTML whatever its `encoding` says. A browser reads MathML in it unless the
    encoding names HTML; the two readings differ only for elements that MathML does not have (`<textarea>`,
    `<style>`, …). This approximation does not establish browser-equivalent boundaries.
  - The rule does not detect an open `object` that makes a browser ignore `</pre>`, a tag that exits foreign
    content, or reconstruction of an unclosed formatting element after `</pre>`. These remain tree-repair limits:
    `<pre><object></pre>a`, `<math><p><textarea></math><P>A  B</P>` and `<pre><b>x</pre><div>y</div>` can still differ.
- **`noscript` is raw text for quad**, as for a browser with scripting. Without scripting a browser reads its
  content as markup; quad copies it either way.
- **In ordinary script data, `</script>` ends the script**, also inside a JavaScript string literal. In
  double-escaped script data (`<!--<script>…`) an inner `</script>` leaves double escaping; it does not close the
  outer script. See the raw-text row above.
- **Comment contents are not reformatted.** A multi-line `<!-- ... -->` is written as one unit with its line breaks
  and indentation as they are.
- **A `<` right before a letter is a tag start, as it is for a browser.** Encode a `<` in prose as `&lt;`. A `<` before
  a space or a digit is text.
- **Input that ends early is copied without a report.** An unterminated `<script>` or comment formats silently; see
  [Input that ends early](#input-that-ends-early).
- **`<script>`/`<style>`/`<svg>` inner content is excluded from the automated comparison against js-beautify** (see
  `differential/`) — js-beautify restructures JS/CSS and reformats SVG markup, while quad copies these blocks.
  Element structure and attributes are still compared.

---

## Untrusted input

quad is designed for **build-pipeline use** — it formats HTML that you generated yourself from your own templates. It is synchronous and has no timeout. Its time and its output are bounded by the size of the input (see [Properties](#properties)), and the gate checks that on generated and on hostile input — but a test is not a safety guarantee for content you don't control.

If you need to format HTML from an untrusted source (user-submitted content, scraped pages, third-party APIs), run quad inside a Worker thread with a timeout. quad is ESM-only, so the worker needs its own file — `require()` on an ESM package inside an `eval: true` Worker (a common pattern for CJS packages) will not work here.

The examples below target the compiled worker (`worker.mjs`), since plain Node — quad's only stated runtime requirement is Node ≥18 — can't execute a `.ts` file directly without a loader. Compile it as part of your build (`tsc`, esbuild, ...), or if you're running under Bun or a TS-loader setup (`tsx`, `ts-node/esm`, ...), point the `Worker`/`Piscina` target at `worker.ts` instead — those can load TypeScript natively.

```typescript
// worker.ts — compiled to worker.mjs, a real, separate file loaded by the Worker below
import { parentPort, workerData } from 'node:worker_threads'
import htmlFmt from '@mkorun/quad'

parentPort!.postMessage(htmlFmt(workerData))
```

```typescript
// main.ts
import { Worker } from 'node:worker_threads'

function htmlFmtSafe(html: string, timeoutMs = 5000): Promise<string> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./worker.mjs', import.meta.url), { workerData: html })

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
// worker.ts — compiled to worker.mjs, see note above
import htmlFmt from '@mkorun/quad'
export default (html: string) => htmlFmt(html)
```

```typescript
// main.ts
import Piscina from 'piscina'

const pool = new Piscina({ filename: new URL('./worker.mjs', import.meta.url).pathname })
const formatted = await pool.run(untrustedHtml)
```

A persistent pool reduces per-call overhead to ~0.5–1 ms (IPC serialization only). Note that the async API is a consequence of thread isolation — if your pipeline is entirely trusted, the sync API remains preferable.

---

## RE2 compatibility

quad's regular expressions use only constructs supported by RE2. Reading tags, comments and text is a plain character/index scanner, not regex-based at all. The regular expressions that remain find the end of raw text: one precompiled pattern per element (`</name` before whitespace, `/` or `>`, each letter spelled in both cases) and one alternation for script data; two more replace single characters. They use literals, character classes, `?` and `|` — no lookaheads, lookbehinds, or backreferences anywhere in the codebase, so there's no catastrophic-backtracking risk on any regex engine, RE2 or otherwise.

This matters if you ever run quad somewhere that specifically requires RE2 syntax (e.g. embedding it in a Go or Rust host via a JS engine backed by RE2, or a linter that flags non-RE2-safe patterns) — not because common edge/serverless platforms use RE2 themselves. Cloudflare Workers and Deno Deploy, for instance, both run on V8 (the same regex engine as Node and Chrome), not RE2 — they're mentioned here only as compatible target environments, not as evidence that RE2-compatibility was required to run on them.

---

## Tests

```bash
./check.sh             # the gate: types, tests with coverage, the browser oracle, the build, no secret
bun test               # 261 tests, no browser
bun oracle/check.ts    # the browser oracle; needs Chromium
```

| Part | What it holds |
|------|---------------|
| `tests/formatting.test.ts` | Unit tests of layout, tag spelling, verbatim content, comments, malformed input |
| `tests/findings.test.ts` | One test per finding of the 2026-11 review and specification (Q-1 to Q-8, N-1 to N-13); each fails on 0.1.5. One per finding of the review of the rewrite (R-1 to R-10) that shows without a browser |
| `tests/correction.test.ts`, `tests/oracle.test.ts` | Last-review wrap and boundary regressions, script-data documentation, and exact negative-oracle verdicts |
| `tests/properties.test.ts` | Generated input from a fixed seed in three domains — conforming documents, the same with broken tags, arbitrary strings — with five option sets: no throw, idempotent, the output bound. Each conforming document comes with its facts (every token in the spelling the contract gives it, and whether whitespace may, must or must not lie before it), and the output must be exactly those. Stress families at 2,000, 8,000 and 32,000 repetitions stay within the output bound |
| `differential/` | Same elements, attributes, text and comments as js-beautify's output on the fixtures; layout differences excluded on purpose |
| `oracle/` | A headless Chromium compares input and output: the DOM in a normal form that ignores whitespace which does not render, and `document.body.innerText`; with `stripComments` also that the comments outside verbatim content are gone. It runs the findings, the fixtures and a sample of the generated documents, and checks quad's block elements against the `display` of the default stylesheet for every HTML element name |

`tsconfig.typecheck.json` checks tests, the generator, differential helpers, the oracle and benchmarks without emitting files.
The gate runs it separately; `tsconfig.json` and the published build remain unchanged.

The oracle is a script of its own, not part of `bun test`. It starts the binary named by `QUAD_CHROMIUM` (default
`chromium`) once, serves the documents from `127.0.0.1` and loads each in a sandboxed frame, where no script of the
document runs. Its own tests are pairs with a known verdict (`oracle/cases.ts`): three false alarms of an earlier
fuzzer must pass; the findings as 0.1.5 wrote them, the findings of the review of the rewrite as it wrote them, and
faults written by hand that the oracle once missed must fail; and the [known limitations](#known-limitations) must
keep failing for their recorded violations. Each negative pair matches its complete DOM, rendered-text and comment
violations against `oracle/expected-violations.json`; another difference or an additional corruption fails. To
intentionally change the corpus, run `bun oracle/check.ts --record-violations` and review every changed observation
before committing it. The recording command still rejects unexpected failures of positive pairs and negative pairs
that no longer fail.

---

## Part of the hadley ecosystem

- [@mkorun/lima](https://www.npmjs.com/package/@mkorun/lima) — frontmatter parser
- [@mkorun/galley](https://www.npmjs.com/package/@mkorun/galley) — template engine
- [@mkorun/quad](https://www.npmjs.com/package/@mkorun/quad) — HTML formatter & normalizer

---

## License

ISC
