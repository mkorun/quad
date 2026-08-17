// Extracts a normalized, DOM-relevant "semantic event stream" from an HTML string using Bun's
// built-in HTMLRewriter (a real, spec-compliant HTML parser — not quad's own tokenizer, so this
// doesn't just check that quad agrees with itself).
//
// The stream captures what must be identical between two formatters that only differ in layout:
// element open/close order, tag names, attribute names + values (in source order), text content,
// comments, and raw script/style/pre/textarea/svg content — all with layout-only whitespace
// (indentation, line-wrapping) normalized away, since that's the entire point of a "formatter".
// "Layout-only" is deliberately narrow — see normalizeProse below for what that excludes.

export type SemanticEvent =
	| { type: 'open'; tag: string; attrs: [string, string][] }
	| { type: 'close'; tag: string }
	| { type: 'text'; value: string }
	| { type: 'comment'; value: string }

// Elements whose text content needs special-case normalization rather than the default prose
// treatment. svg is handled separately (excluded like script/style — see flushText) since it's
// an exclusion, not a normalization variant, and its "raw" boundary uses a different rule (an
// explicit </svg> handling isn't needed; a plain string comparison in flushText covers it).
const rawContentTags = new Set(['script', 'style', 'pre', 'textarea'])

// Standard HTML void elements — never have a closing tag, and HTMLRewriter's onEndTag() throws
// ("No end tag.") if called on one. Kept independent of quad's own htmlVoidElements set so this
// extractor doesn't implicitly trust quad's own list.
const voidElements = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'])

// Phrasing/replaced elements — whitespace immediately next to one of these can affect rendered
// word spacing, so its *presence* must be preserved exactly (see normalizeProse). This includes
// inline void elements such as img/input/wbr; classifying every void element as layout-only would
// hide real text changes. Block elements remain layout boundaries. Independent of quad's own
// element sets, for the same reason as voidElements above.
const inlineElements = new Set([
	'a', 'abbr', 'audio', 'b', 'bdi', 'bdo', 'br', 'button', 'canvas', 'cite', 'code',
	'data', 'datalist', 'del', 'dfn', 'em', 'embed', 'i', 'iframe', 'img', 'input', 'ins',
	'kbd', 'label', 'map', 'mark', 'meter', 'noscript', 'object', 'output', 'picture',
	'progress', 'q', 'rb', 'rp', 'rt', 'rtc', 'ruby', 's', 'samp', 'select', 'slot',
	'small', 'span', 'strong', 'sub', 'sup', 'svg', 'textarea', 'time', 'u', 'var', 'video',
	'wbr',
])
const isInlineElement = (tag: string): boolean => inlineElements.has(tag) || tag.indexOf('-') > 0

// Bun's HTMLRewriter returns attribute values and text verbatim, without decoding entities —
// so "&quot;" and a literal '"' (e.g. from a single- vs. double-quoted source attribute) would
// otherwise look like different content when they're the same logical value. Decode before
// comparing anything. &nbsp; decodes to the real NBSP character (U+00A0), not a regular space —
// it's meaningful, visible content, and must stay distinguishable from layout whitespace below.
const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
const decodeEntities = (s: string): string =>
	s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, ref: string) => {
		if (ref[0] === '#') {
			const code = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10)
			if (code === 0) return '\uFFFD'
			return Number.isFinite(code) && code > 0 && code <= 0x10FFFF && !(code >= 0xD800 && code <= 0xDFFF)
				? String.fromCodePoint(code)
				: m
		}
		return NAMED_ENTITIES[ref] ?? m
	})

// HTML's own "ASCII whitespace" (tab, LF, FF, CR, space) — deliberately narrower than
// JavaScript's \s / trim(), which also matches NBSP and other Unicode space separators. Using
// JS's definition here would silently treat "Hello&nbsp;World" and "Hello World" as identical.
const HTML_WS = /[\t\n\f\r ]/
const htmlWsTrim = (s: string): string => s.replace(/^[\t\n\f\r ]+/, '').replace(/[\t\n\f\r ]+$/, '')

// Collapses layout-only whitespace: arbitrary runs of real HTML whitespace (word-wrapping,
// indentation) become a single space, since *how much* whitespace separates two words is a
// layout decision. But *whether* whitespace was present at all is preserved as exactly one
// boundary space when it's adjacent to real inline content — collapsing it away entirely would
// make "Hello <em>" and "Hello<em>" indistinguishable (the exact word-gluing bug class this
// suite exists to catch).
//
// A *pure-whitespace* gap (nothing but whitespace between two tags, collapsed === '') needs
// BOTH neighbors to be inline-level before it's treated as significant — not just one. Real HTML
// rendering collapses leading/trailing whitespace at the start/end of a block's content away
// entirely, regardless of whether the immediate child there happens to be inline (e.g.
// "<div>\n  <span>x</span>" renders identically to "<div><span>x</span>" — the newline+indent
// right after <div> opens is not preceded by any inline content, so it's not significant even
// though <span> itself is inline). Text that has *real* (non-whitespace) content only needs its
// own respective side to matter, since the content itself is unambiguously inline-level.
const normalizeProse = (s: string, leadingMatters: boolean, trailingMatters: boolean): string => {
	const decoded = decodeEntities(s)
	const collapsed = htmlWsTrim(decoded).replace(/[\t\n\f\r ]+/g, ' ')
	if (collapsed === '') return leadingMatters && trailingMatters ? ' ' : ''
	const hadLeadingWs = leadingMatters && HTML_WS.test(decoded[0] ?? '')
	const hadTrailingWs = trailingMatters && HTML_WS.test(decoded[decoded.length - 1] ?? '')
	return (hadLeadingWs ? ' ' : '') + collapsed + (hadTrailingWs ? ' ' : '')
}

// pre/textarea and comments are documented as verbatim-preserved by quad — compared exactly
// (only entity-decoded, plus CRLF normalized to LF as a narrow, defensible cross-platform
// allowance), not whitespace-collapsed. Leading/trailing whitespace inside <pre>/<textarea> is
// content, not layout, and must not be treated as trimmable.
//
// svg is *not* in this bucket — it's excluded from comparison entirely (see flushText). quad's
// raw-content scanner treats <svg>...</svg> as one opaque block, so its output reflects the
// *source's* original inter-element whitespace verbatim; js-beautify treats svg as regular nested
// HTML and reformats that whitespace with its own indentation. Neither is wrong, but comparing
// them — exactly or via normalizeProse's boundary-collapse — produced false failures purely from
// that formatting-strategy difference, the same category as the script/style exclusion below.
const normalizeExact = (s: string): string => decodeEntities(s).replace(/\r\n/g, '\n')

// script/style are excluded from comparison entirely — see the comment in flushText() below.

// application/json and application/ld+json script content: both formatters may re-wrap the
// JSON's own line breaks differently (js-beautify appears to re-pretty-print it) — that's a
// layout choice, not a content difference, so compare parsed values rather than text/lines.
// Falls back to exact-text comparison if parsing fails (never silently ignores content).
const normalizeJson = (s: string): string => {
	try {
		return JSON.stringify(JSON.parse(s))
	} catch {
		return normalizeExact(s)
	}
}

const jsonScriptType = new Set(['application/json', 'application/ld+json'])

export const extractEvents = async (html: string): Promise<SemanticEvent[]> => {
	const events: SemanticEvent[] = []
	const rawStack: string[] = []
	let textBuffer = ''
	// Was the most recently emitted open/close event an inline element? Drives whether the
	// *leading* boundary of the next flushed text buffer is treated as significant. Starts false:
	// there's nothing before the very start of the document for leading whitespace to separate.
	let prevWasInline = false

	const flushText = (trailingMatters: boolean) => {
		if (textBuffer === '') return
		const kind = rawStack[rawStack.length - 1]
		if (kind === 'script' || kind === 'style' || kind === 'svg') {
			// Excluded from comparison, not just whitespace-normalized: js-beautify actively
			// restructures JS/CSS/SVG (adds line breaks, strips selector-combinator spacing,
			// reformats nested SVG elements with its own indentation, ...), while quad documents
			// preserving this content verbatim — for SVG specifically, quad never even tokenizes
			// past the opening <svg> tag, so its output reflects the *source's* original
			// formatting exactly, which is a different (also correct) thing from js-beautify's
			// reformatting, not a content bug. That's a real, accepted behavioral difference, not
			// something a text/whitespace normalizer can paper over without a real JS/CSS/XML
			// parser. The element's tag + attributes are still compared — only the inner content
			// is out of scope here. quad's own promise to preserve script/style verbatim
			// (byte-for-byte, no reindentation) is covered directly in tests/formatting.test.ts,
			// including the specific risk this exclusion accepts: reindentation silently altering
			// a multi-line template literal's string value.
			textBuffer = ''
			return
		}
		const value =
			kind === 'script-json'
				? normalizeJson(textBuffer)
				: kind === 'pre' || kind === 'textarea'
					? normalizeExact(textBuffer)
					: normalizeProse(textBuffer, prevWasInline, trailingMatters)
		if (value !== '') events.push({ type: 'text', value })
		textBuffer = ''
	}

	const rewriter = new HTMLRewriter().on('*', {
		element(el) {
			const tag = el.tagName
			flushText(isInlineElement(tag))
			const attrs: [string, string][] = []
			for (const [name, value] of el.attributes) attrs.push([name, decodeEntities(value)])
			events.push({ type: 'open', tag, attrs })
			prevWasInline = isInlineElement(tag)

			// Void elements (br, img, ...) and explicitly self-closed tags (<path ... />, <svg/>,
			// common in inline SVG) never get an end tag — HTMLRewriter throws if onEndTag() is
			// called on one. They also can't contain content, so must never be pushed onto
			// rawStack: doing so unconditionally (checking self-closing only *inside* the
			// onEndTag guard, after the push) left a stale entry on the stack forever whenever a
			// self-closing raw-content-tagged element appeared — e.g. a lone `<svg/>` would mark
			// *all* subsequent text in the document as "svg content" and normalize it as such,
			// masking any real differences after that point.
			const hasEndTag = !voidElements.has(tag) && !el.selfClosing
			if (hasEndTag) {
				if (tag === 'script' && jsonScriptType.has(attrs.find(([n]) => n === 'type')?.[1] ?? '')) {
					rawStack.push('script-json')
				} else if (rawContentTags.has(tag) || tag === 'svg') {
					rawStack.push(tag)
				}
				el.onEndTag(() => {
					// The text immediately before this closing tag: its trailing boundary matters
					// exactly when the element closing here is inline (e.g. "<em>x </em>y" vs.
					// "<em>x</em>y" are visually different; "<div>x </div>y" is not).
					flushText(isInlineElement(tag))
					if (tag === 'script' || rawContentTags.has(tag) || tag === 'svg') rawStack.pop()
					events.push({ type: 'close', tag })
					prevWasInline = isInlineElement(tag)
				})
			}
		},
		text(t) {
			textBuffer += t.text
		},
		comments(c) {
			// Comments are rendering-transparent: treat the boundary as inline-sensitive so
			// source whitespace on either side remains observable, without making layout-only
			// whitespace at a block boundary significant (normalizeProse still requires both
			// sides for a whitespace-only buffer).
			flushText(true)
			const value = normalizeExact(c.text)
			if (value !== '') events.push({ type: 'comment', value })
			prevWasInline = true
		},
	})

	// transform() is lazy — must consume the body for the handlers above to actually run
	await rewriter.transform(new Response(html)).text()
	flushText(false) // end of document — no next element for a trailing boundary to separate from
	return events
}
