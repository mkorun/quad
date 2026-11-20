import type { HtmlFmtOptions } from './types.js'

// The closed table of the contract (README "The contract"). A name in none of these lists is inline.
const blockElements = new Set([
	'address', 'article', 'aside', 'blockquote', 'body', 'caption', 'center', 'col', 'colgroup', 'dd', 'details', 'dialog',
	'dir', 'div', 'dl', 'dt', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'frame', 'frameset', 'h1', 'h2', 'h3',
	'h4', 'h5', 'h6', 'head', 'header', 'hgroup', 'hr', 'html', 'legend', 'li', 'listing', 'main', 'menu', 'nav', 'ol',
	'optgroup', 'option', 'p', 'plaintext', 'pre', 'search', 'section', 'summary', 'table', 'tbody', 'td', 'tfoot', 'th',
	'thead', 'tr', 'ul', 'xmp',
])
// Elements that render nothing: they take a line of their own where the whitespace next to them allows it
const metadataElements = new Set(['base', 'link', 'meta', 'script', 'style', 'title'])
const voidElements = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'])
// Content is text up to the element's own end tag; `plaintext` never ends
const rawTextElements = ['iframe', 'noembed', 'noframes', 'noscript', 'script', 'style', 'textarea', 'title', 'xmp']
// Content is copied up to the matching end tag, counting nested elements of the same name
const preElements = new Set(['listing', 'pre'])
const foreignElements = new Set(['math', 'svg'])
// Inside foreign content a browser reads the content of these elements as HTML again: the HTML integration points
// of SVG and the text integration points of MathML. <annotation-xml> is one with an `encoding` that names HTML;
// with another it holds MathML, or an <svg> that a browser reads as SVG there. quad reads both as HTML: in what
// MathML allows there, the two readings find the same end.
const integrationPoints = new Map([
	['math', new Set(['annotation-xml', 'mi', 'mn', 'mo', 'ms', 'mtext'])],
	['svg', new Set(['desc', 'foreignobject', 'title'])],
])

// One pattern per raw text element finds its end tag: "</name" before whitespace, "/" or ">". The letters are
// spelled in both cases, so the match is ASCII-only on every regular expression engine.
const endTagSource = (name: string): string =>
	'</' + name.replace(/[a-z]/g, letter => '[' + letter + letter.toUpperCase() + ']') + '[\\t\\n\\f\\r />]'
const endTagPatterns = new Map(rawTextElements.map(name => [name, new RegExp(endTagSource(name), 'g')]))
// Script data also knows "<!--", "<script" inside it and "-->": between them "</script" does not end the script
const scriptPattern = new RegExp('<!--|-->|' + endTagSource('script').replace('</', '</?'), 'g')

// What lies between two neighbouring tokens. FIXED is a space that may not become a line break.
const NONE = 0, FIXED = 1, SPACE = 2, BREAK = 3
// What a run holds. From METADATA on an atom renders nothing; a metadata element still is content of its parent.
const WORD = 0, TAG = 1, METADATA = 2, DOCTYPE = 3, COMMENT = 4
// What the reader found at a "<"
const START_TAG = 0, END_TAG = 1, COMMENT_MARKUP = 2, BOGUS_COMMENT = 3, DOCTYPE_MARKUP = 4

const TAB = 9, LF = 10, FF = 12, CR = 13, SP = 32, BANG = 33, DQ = 34, HASH = 35, AMP = 38, SQ = 39, DASH = 45, SLASH = 47
const COLON = 58, LT = 60, EQ = 61, GT = 62, QUESTION = 63, BACKTICK = 96
// A line break next to U+200B renders as nothing where a space renders (Chromium); between two characters from
// U+1100 on, the East Asian wide ones among them, CSS Text lets a browser do the same
const ZERO_WIDTH_SPACE = 0x200b, WIDE_FROM = 0x1100

const isLetter = (code: number): boolean => (code >= 97 && code <= 122) || (code >= 65 && code <= 90)
const isDigit = (code: number): boolean => code >= 48 && code <= 57
const isTextSpace = (code: number): boolean => code === SP || code === LF || code === TAB || code === CR
// Inside a tag the form feed is whitespace too; in text it is a character that renders
const isTagSpace = (code: number): boolean => isTextSpace(code) || code === FF

// The common names from https://html.spec.whatwg.org/entities.json; all other names stay uncertain.
const namedEdgeCharacters = new Map([
	['lt', LT], ['gt', GT], ['amp', AMP], ['quot', DQ], ['apos', SQ], ['nbsp', 0xa0],
])
const namesWithoutSemicolon = new Set(['lt', 'gt', 'amp', 'quot', 'nbsp'])

// The decoded character at a word's edge. Unknown names conservatively keep a neighbouring space;
// the source spelling stays intact. Match the whole name so e.g. &ltimes; is not mistaken for &lt.
const edgeCharacter = (text: string, first: boolean): number => {
	const at = first ? 0 : text.lastIndexOf('&')
	if (at >= 0 && text.charCodeAt(at) === AMP) {
		const reference = text.slice(at)
		const numeric = /^&#([xX][0-9a-fA-F]+|[0-9]+);?/.exec(reference)
		if (numeric !== null && (first || numeric[0].length === reference.length)) {
			const digits = numeric[1]!
			const value = digits[0] === 'x' || digits[0] === 'X' ? parseInt(digits.slice(1), 16) : parseInt(digits, 10)
			// An encoded space collapses with the adjacent whitespace; the character beyond it is uncertain.
			if (isTagSpace(value)) return ZERO_WIDTH_SPACE
			// Browsers remap C1 references through Windows-1252. None of those replacements is U+200B or
			// East Asian wide, so the C1 values below WIDE_FROM still make a safe wrap decision here.
			return value === 0 || value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff) ? 0xfffd : value
		}
		const named = /^&([a-zA-Z][a-zA-Z0-9]*)(;?)/.exec(reference)
		if (named !== null && (first || named[0].length === reference.length)) {
			const name = named[1]!
			if (named[2] === ';' || namesWithoutSemicolon.has(name)) {
				return namedEdgeCharacters.get(name) ?? ZERO_WIDTH_SPACE
			}
			return ZERO_WIDTH_SPACE
		}
	}
	return text.charCodeAt(first ? 0 : text.length - 1)
}

const htmlFmt = (html: string, options: HtmlFmtOptions = {}): string => {
	const { indentation = '  ', lineWrap = 120, stripComments = false } = options
	const length = html.length
	let uncertainBoundary = false
	let inHead = false, bodySeen = false, bodyClosed = false
	// The left margin, indentation plus alignment, never passes this: the output stays linear in the input
	const maxMargin = Math.floor(lineWrap / 2)

	let out = ''
	let depth = 0
	// A blank line follows <html>, </head> and </body>
	let blankLine = false
	// The last block tag written is a start tag whose element has no content yet; it ends at this column
	let open = false
	let openColumn = 0

	// The run: the inline tokens since the last block tag, each with the gap before it
	const atoms: string[] = []
	const kinds: number[] = []
	const gaps: number[] = []
	let count = 0
	let gap = NONE
	let runWidth = 0
	let runHasContent = false
	let runHasSpace = false
	let runHasBreak = false
	let runOwnLines = false
	// The nearest text character before the current position, seen through tags; <wbr> counts as U+200B
	let lastChar = 0

	// What readMarkup found
	let markKind = START_TAG
	let markName = ''
	let markText = ''
	let markSelfClosing = false
	// markText is the normal form of a regular tag, not a copy of the input
	let markRegular = false

	const pads: string[] = ['']
	const pad = (level: number): string => {
		while (pads.length <= level && pads[pads.length - 1]!.length + indentation.length <= maxMargin) {
			pads.push(pads[pads.length - 1]! + indentation)
		}
		return pads[level < pads.length ? level : pads.length - 1]!
	}

	const newLine = (margin: string) => {
		if (out.length > 0) out += blankLine ? '\n\n' : '\n'
		blankLine = false
		out += margin
	}

	// "<" starts markup before a letter, "/", "!" or "?"; any other "<" is text
	const startsMarkup = (at: number): boolean => {
		const code = html.charCodeAt(at + 1)
		return isLetter(code) || code === SLASH || code === BANG || code === QUESTION
	}

	// Reads the tag at `start` as the HTML tokenizer does and writes its normal form at once: the name in lower
	// case, one `separator` between attributes, every value in double quotes. A tag outside that grammar is copied.
	// Returns the index after its ">", or -1 when the input ends inside the tag.
	const readTag = (start: number, separator: string): number => {
		const isEnd = html.charCodeAt(start + 1) === SLASH
		const nameStart = isEnd ? start + 2 : start + 1
		let regular = true
		let code = 0
		let i = nameStart
		for (; i < length; i++) {
			code = html.charCodeAt(i)
			if (code === GT || code === SLASH || isTagSpace(code)) break
			if (!isLetter(code) && !isDigit(code) && code !== DASH && code !== COLON) regular = false
		}
		markKind = isEnd ? END_TAG : START_TAG
		// A name with any other character is in no list, so only a plain name needs its lower case
		markName = regular ? html.slice(nameStart, i).toLowerCase() : html.slice(nameStart, i)
		markSelfClosing = false
		let text = (isEnd ? '</' : '<') + markName
		let glue = ' '
		for (;;) {
			const gapStart = i
			while (i < length && isTagSpace(html.charCodeAt(i))) i++
			if (i >= length) return -1
			code = html.charCodeAt(i)
			if (code === GT) break
			if (code === SLASH) {
				// "/" counts only directly before ">"
				i++
				if (html.charCodeAt(i) === GT) markSelfClosing = true
				if (isEnd || !markSelfClosing) regular = false
				continue
			}
			// An attribute: its name runs to whitespace, "/", ">" or "="; a "=" in front belongs to the name
			if (i === gapStart || isEnd || code === EQ || code === DQ || code === SQ || code === LT) regular = false
			const attributeStart = i
			for (i++; i < length; i++) {
				code = html.charCodeAt(i)
				if (code === EQ || code === GT || code === SLASH || isTagSpace(code)) break
				if (code === DQ || code === SQ || code === LT) regular = false
			}
			text += glue + html.slice(attributeStart, i)
			glue = separator
			let valueStart = i
			while (valueStart < length && isTagSpace(html.charCodeAt(valueStart))) valueStart++
			if (html.charCodeAt(valueStart) !== EQ) continue
			valueStart++
			while (valueStart < length && isTagSpace(html.charCodeAt(valueStart))) valueStart++
			code = html.charCodeAt(valueStart)
			if (code === DQ || code === SQ) {
				// A quote opens a value only here, after "="
				i = html.indexOf(code === DQ ? '"' : "'", valueStart + 1)
				if (i === -1) return -1
				const value = html.slice(valueStart + 1, i)
				text += '="' + (code === SQ && value.includes('"') ? value.replace(/"/g, '&quot;') : value) + '"'
				i++
			} else {
				// Without quotes the value runs to whitespace or ">"
				for (i = valueStart; i < length; i++) {
					code = html.charCodeAt(i)
					if (code === GT || isTagSpace(code)) break
					if (code === DQ || code === SQ || code === LT || code === EQ || code === BACKTICK) regular = false
				}
				if (i === valueStart) regular = false
				text += '="' + html.slice(valueStart, i) + '"'
			}
		}
		i++
		markRegular = regular
		if (!regular) markText = html.slice(start, i)
		else markText = text + (markSelfClosing && !voidElements.has(markName) ? ' />' : '>')
		return i
	}

	// The index after the comment whose "<!--" ends before `from`, or -1. "<!-->" and "<!--->" are whole comments.
	const commentEnd = (from: number): number => {
		const code = html.charCodeAt(from)
		if (code === GT) return from + 1
		if (code === DASH && html.charCodeAt(from + 1) === GT) return from + 2
		for (let i = from; ; i++) {
			i = html.indexOf('--', i)
			if (i === -1) return -1
			const after = html.charCodeAt(i + 2)
			if (after === GT) return i + 3
			if (after === BANG && html.charCodeAt(i + 3) === GT) return i + 4
		}
	}

	// Reads the markup at the "<" of `start` into markKind, markName, markText and markSelfClosing.
	// Returns the index after it, or -1 when the input ends inside it.
	const readMarkup = (start: number, separator: string): number => {
		const code = html.charCodeAt(start + 1)
		if (isLetter(code) || (code === SLASH && isLetter(html.charCodeAt(start + 2)))) return readTag(start, separator)
		let end: number
		if (code === BANG && html.startsWith('--', start + 2)) {
			markKind = COMMENT_MARKUP
			end = commentEnd(start + 4)
		} else {
			// A doctype and a bogus comment ("<!…", "<?…", "</" before no letter) run to the first ">"
			markKind = code === BANG && html.slice(start + 2, start + 9).toLowerCase() === 'doctype' ? DOCTYPE_MARKUP : BOGUS_COMMENT
			end = html.indexOf('>', start + 2) + 1
		}
		if (end <= 0) return -1
		markText = markKind === DOCTYPE_MARKUP ? '<!doctype' + html.slice(start + 9, end) : html.slice(start, end)
		return end
	}

	// The index of the "</script" that ends the script whose content starts at `from`, or -1
	const scriptEnd = (from: number): number => {
		// 0: script data; 1: escaped, after "<!--"; 2: double escaped, after "<script" inside it
		let state = 0
		scriptPattern.lastIndex = from
		for (;;) {
			const match = scriptPattern.exec(html)
			if (match === null) return -1
			const token = match[0]
			if (token === '<!--') {
				if (state === 0) state = 1
				// Its two dashes may also be the start of "-->": "<!-->" does not escape
				scriptPattern.lastIndex = match.index + 2
			} else if (token === '-->') state = 0
			else if (token.charCodeAt(1) !== SLASH) {
				if (state === 1) state = 2
			} else if (state === 2) state = 1
			else return match.index
		}
	}

	// The index of the end tag of the raw text element `name` whose content starts at `from`, or -1
	const rawTextEnd = (from: number, name: string): number => {
		if (name === 'script') return scriptEnd(from)
		const pattern = endTagPatterns.get(name)!
		pattern.lastIndex = from
		const match = pattern.exec(html)
		return match === null ? -1 : match.index
	}

	// The index of the end tag that matches the verbatim element `name` whose content starts at `from`, or -1.
	// The same reader runs inside: comments, quoted values and raw text hide an end tag, as they do in a browser.
	// A browser reads the content in one of two ways, and an element inside that changes the way is a region of its
	// own, up to its own matching end tag:
	//   as HTML     in <pre> and <listing>, and in an integration point inside foreign content: raw text hides
	//               all up to its end tag, <svg> and <math> hold foreign content;
	//   as foreign  in <svg> and <math>: there is no raw text, "/>" closes an element.
	// A visible end tag of an outer region before the inner one ends makes the boundary uncertain. The caller
	// then returns the entire input, including anything already formatted, unchanged.
	const verbatimEnd = (from: number, name: string): number => {
		// The open regions, the innermost last; an element inside a region with the name of that region is one more
		const regions = [name]
		const regionCounts = new Map([[name, 1]])
		let region = name
		let foreign = foreignElements.has(name)
		let i = from
		for (;;) {
			i = html.indexOf('<', i)
			if (i === -1) return -1
			if (!startsMarkup(i)) {
				i++
				continue
			}
			let end: number
			// "<![CDATA[…]]>" is a section everywhere inside <svg> and <math>, so in every region but <pre> and
			// <listing>, which are regions only outside of those
			if (!preElements.has(region) && html.startsWith('<![CDATA[', i)) {
				end = html.indexOf(']]>', i + 9) + 3
				if (end < 3) return -1
			} else {
				end = readMarkup(i, ' ')
				if (end === -1) return -1
				let opens = false
				if (markKind === END_TAG && markName === region) {
					regionCounts.set(region, regionCounts.get(region)! - 1)
					regions.pop()
					if (regions.length === 0) return i
					region = regions[regions.length - 1]!
					foreign = foreignElements.has(region)
				} else if (markKind === END_TAG && (regionCounts.get(markName) ?? 0) > 0) {
					uncertainBoundary = true
					return -1
				} else if (markKind === START_TAG) {
					if (foreign) opens = !markSelfClosing && (markName === region || integrationPoints.get(region)!.has(markName))
					else if (markName === 'plaintext' || endTagPatterns.has(markName)) {
						// The end tag of the raw text is read here, so that it ends no region of its name
						end = markName === 'plaintext' ? -1 : rawTextEnd(end, markName)
						if (end !== -1) end = readMarkup(end, ' ')
						if (end === -1) return -1
					} else opens = markName === region || (foreignElements.has(markName) && !markSelfClosing)
				}
				if (opens) {
					regionCounts.set(markName, (regionCounts.get(markName) ?? 0) + 1)
					regions.push(markName)
					region = markName
					foreign = foreignElements.has(region)
				}
			}
			i = end
		}
	}

	// Adds one inline token to the run, with the gap seen before it
	const push = (text: string, kind: number) => {
		// A space may become a line break only where the line break renders as that space: not next to U+200B and
		// not between two wide characters, however many tags lie between the space and the character
		let before = gap
		if (before === SPACE && lastChar === ZERO_WIDTH_SPACE) before = FIXED
		if (kind === WORD) {
			const first = edgeCharacter(text, true)
			if (first === ZERO_WIDTH_SPACE || (first >= WIDE_FROM && lastChar >= WIDE_FROM)) {
				if (before === SPACE) before = FIXED
				for (let k = count - 1; k >= 0 && kinds[k] !== WORD; k--) {
					if (gaps[k] === SPACE) gaps[k] = FIXED
				}
			}
			lastChar = edgeCharacter(text, false)
		}
		if (kind <= METADATA) runHasContent = true
		if (kind === METADATA || kind === DOCTYPE) runOwnLines = true
		if (before !== NONE) {
			runHasSpace = true
			if (count > 0) {
				runWidth++
				if (before === BREAK) runHasBreak = true
			}
		}
		if (kind !== WORD && text.includes('\n')) runHasBreak = true
		runWidth += text.length
		atoms[count] = text
		kinds[count] = kind
		gaps[count] = before
		count++
		gap = NONE
	}

	// A metadata element and a doctype take a line of their own where the whitespace next to them is free (only
	// comments, doctypes and whole metadata elements lie between it and a block tag) or is a space that may break.
	const giveOwnLines = () => {
		let lead = 0
		while (lead < count && kinds[lead]! >= METADATA) lead++
		let trail = count
		while (trail > 0 && kinds[trail - 1]! >= METADATA) trail--
		const ownsLine = (k: number): boolean => kinds[k] === METADATA || kinds[k] === DOCTYPE
		if (ownsLine(0) || ownsLine(count - 1)) runHasBreak = true
		for (let k = 1; k < count; k++) {
			if ((ownsLine(k - 1) || ownsLine(k)) && (k <= lead || k >= trail || gaps[k] === SPACE)) {
				gaps[k] = BREAK
				runHasBreak = true
			}
		}
	}

	// The length of the first line of atom k; only a word is known to have one line
	const firstLineLength = (k: number): number => {
		const atom = atoms[k]!
		const lineEnd = kinds[k] === WORD ? -1 : atom.indexOf('\n')
		return lineEnd === -1 ? atom.length : lineEnd
	}

	// Writes the run as lines at the current depth: a line break stays one, a space becomes one where the tokens
	// up to the next gap would pass lineWrap
	const writeLines = () => {
		const margin = pad(depth)
		let column = 0
		for (let k = 0; k < count; k++) {
			const atom = atoms[k]!
			let before = k === 0 ? BREAK : gaps[k]!
			if (before === SPACE) {
				let end = column + 1
				let next = k
				do {
					const first = firstLineLength(next)
					end += first
					if (first < atoms[next]!.length) break
					next++
				} while (end <= lineWrap && next < count && gaps[next] === NONE)
				if (end > lineWrap) before = BREAK
			}
			if (before === BREAK) {
				newLine(margin)
				column = margin.length
			} else if (before !== NONE) {
				out += ' '
				column++
			}
			out += atom
			const lastLineStart = kinds[k] === WORD ? -1 : atom.lastIndexOf('\n')
			column = lastLineStart === -1 ? column + atom.length : atom.length - lastLineStart - 1
		}
	}

	// Writes the run, then the block tag that ends it (none at the end of the input)
	const endRun = (tag: string, isEndTag: boolean, outdent: boolean) => {
		// An element with nothing but comments and doctypes stays empty: no whitespace comes between them, so
		// neither takes a line of its own. Whitespace-only content stays whitespace.
		const empty = open && isEndTag && !runHasContent && !runHasSpace && gap === NONE
		if (runOwnLines && !empty) giveOwnLines()
		let oneLine = empty
		if (open && isEndTag && runHasContent) {
			// Content that fits goes on the line of both tags
			oneLine = !runHasBreak && openColumn + runWidth + tag.length <= lineWrap
		}
		if (oneLine) {
			for (let k = 0; k < count; k++) out += k > 0 && gaps[k] !== NONE ? ' ' + atoms[k]! : atoms[k]!
		} else if (count > 0) writeLines()
		if (outdent && depth > 0) depth--
		if (oneLine) out += tag
		else if (tag !== '') {
			newLine(pad(depth))
			out += tag
		}
		count = 0
		gap = NONE
		runWidth = 0
		runHasContent = runHasSpace = runHasBreak = runOwnLines = false
		lastChar = 0
	}

	// The input ends inside the construct at `start`: the rest is copied unchanged
	const tail = (start: number, block: boolean): number => {
		if (block) {
			endRun(html.slice(start), false, false)
			open = false
		} else push(html.slice(start), TAG)
		return length
	}

	// Taking out a comment directly after "<", or after "&" plus letters, digits or "#", with text directly after
	// it, would join that text into markup or a character reference
	const holdsTextApart = (end: number): boolean => {
		if (gap !== NONE || count === 0 || kinds[count - 1] !== WORD) return false
		const next = html.charCodeAt(end)
		if (end === length || isTextSpace(next) || (next === LT && startsMarkup(end))) return false
		const word = atoms[count - 1]!
		let i = word.length - 1
		if (word.charCodeAt(i) === LT) return true
		while (i >= 0 && (isLetter(word.charCodeAt(i)) || isDigit(word.charCodeAt(i)) || word.charCodeAt(i) === HASH)) i--
		return i >= 0 && word.charCodeAt(i) === AMP
	}

	// Handles the markup at the "<" of `start` and returns the index after it
	const markup = (start: number): number => {
		let end = readMarkup(start, ' ')
		if (end === -1) return tail(start, false)
		if (markKind >= COMMENT_MARKUP) {
			// A comment taken out is not pushed: the gaps on both sides merge into one
			if (markKind !== COMMENT_MARKUP || !stripComments || holdsTextApart(end)) {
				push(markText, markKind === DOCTYPE_MARKUP ? DOCTYPE : COMMENT)
			}
			return end
		}
		const name = markName
		// These tags can be ignored or reprocessed by the browser's body insertion modes. Keep the document
		// unchanged instead of assigning a block boundary to them. An empty, normally closed body still formats.
		const closing = markKind === END_TAG
		if (bodyClosed && !(closing && name === 'html')) uncertainBoundary = true
		if (name === 'head') {
			if (bodySeen) uncertainBoundary = true
			inHead = !closing
		} else if (name === 'body') {
			if (!closing && bodySeen) uncertainBoundary = true
			if (closing) bodyClosed = true
			else bodySeen = true
		} else if (!inHead && name !== 'html' && !metadataElements.has(name) && !closing) bodySeen = true
		if (uncertainBoundary) return length

		const block = blockElements.has(name)
		if (markKind === END_TAG) {
			if (block) {
				endRun(markText, true, name !== 'html')
				open = false
				blankLine = name === 'head' || name === 'body'
			} else push(markText, TAG)
			return end
		}
		if (markRegular && markText.length > lineWrap) {
			// A long tag wraps its attributes, aligned behind the tag name; one that is copied has nothing to wrap
			const alignment = Math.max(0, Math.min(pad(depth).length + name.length + 2, maxMargin))
			readTag(start, '\n' + ' '.repeat(alignment))
		}
		let text = markText
		// An element with verbatim content is one token: start tag, content, end tag
		let whole = false
		if (name === 'plaintext') return tail(start, true)
		if (endTagPatterns.has(name) || preElements.has(name) || (foreignElements.has(name) && !markSelfClosing)) {
			const contentEnd = endTagPatterns.has(name) ? rawTextEnd(end, name) : verbatimEnd(end, name)
			const elementEnd = contentEnd === -1 ? -1 : readMarkup(contentEnd, ' ')
			if (elementEnd === -1) return tail(start, block)
			text += html.slice(end, contentEnd) + markText
			end = elementEnd
			whole = true
		}
		if (!block) {
			push(text, metadataElements.has(name) ? METADATA : TAG)
			if (name === 'wbr') lastChar = ZERO_WIDTH_SPACE
			return end
		}
		const margin = pad(depth)
		endRun(text, false, false)
		open = !whole && !voidElements.has(name)
		if (open) {
			openColumn = text.includes('\n') ? Infinity : margin.length + text.length
			if (name !== 'html') depth++
		}
		blankLine = name === 'html'
		return end
	}

	// A byte order mark belongs to the encoding, not to the document's body content.
	const hasByteOrderMark = html.charCodeAt(0) === 0xfeff
	let i = hasByteOrderMark ? 1 : 0
	while (i < length) {
		let code = html.charCodeAt(i)
		if (code === SP || code === TAB) {
			if (gap === NONE) gap = SPACE
			i++
		} else if (code === LF || code === CR) {
			gap = BREAK
			i++
		} else if (code === LT && startsMarkup(i)) {
			i = markup(i)
			if (uncertainBoundary) return html
		} else {
			if (bodyClosed) return html
			if (!inHead) bodySeen = true
			// A word runs to whitespace or to markup
			const wordStart = i
			for (i++; i < length; i++) {
				code = html.charCodeAt(i)
				if (isTextSpace(code) || (code === LT && startsMarkup(i))) break
			}
			push(html.slice(wordStart, i), WORD)
		}
	}
	// The input ends in an open element that holds nothing but whitespace: it stays whitespace
	if (open && count === 0 && gap !== NONE) out += '\n'
	endRun('', true, false)
	return (hasByteOrderMark ? '\ufeff' : '') + out
}

export default htmlFmt
export type { HtmlFmtOptions }
