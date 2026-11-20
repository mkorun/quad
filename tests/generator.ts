// The generator of the gate's inputs, in three domains that are kept apart:
//   D1  conforming documents from a grammar that respects content models, with varied whitespace and tag spelling
//   D2  D1 documents with tags made irregular or unterminated
//   D3  arbitrary strings
// and the stress families. With each D1 document come its facts: every token the output must contain, in order,
// in the spelling the contract gives it, and what must lie between it and the token before (README "The contract").

import { createRandom, type Random } from './prng.ts'

// What the output must have between a token and the one before it
//   glued  nothing: the source has nothing there and both are inline (W2)
//   apart  whitespace: the source has whitespace there and both are inline (W2)
//   free   whitespace or nothing: next to a block tag, a comment, a doctype or a metadata element
export type Gap = 'glued' | 'apart' | 'free'

export interface Fact {
	text: string
	gap: Gap
	// A comment: gone from the output with stripComments
	comment: boolean
}

export interface ConformingDocument {
	source: string
	facts: Fact[]
}

interface Attribute {
	name: string
	// null: an attribute without a value
	value: string | null
}

const whitespaceChoices = ['', '', '', '', '', ' ', ' ', ' ', '\n', '\n', '\n  ', '  ', '\t', '\r\n', ' \n\n ', '\n\t\t']
const whitespaceInTag = [' ', ' ', ' ', '  ', '\n', '\t', '\n    ', ' \f ']

const words = [
	'a', 'I', 'the', 'quick', 'brown', 'fox', 'jumps', 'over', 'lazy', 'dog.', 'Hello,', 'world!', '(note)', '—', '1', '42',
	'3.14', 'x=y', '"quoted"', "it's", '>', '/', '--', '!', 'a/b', '&amp;', '&lt;b&gt;', '&#38;', '&nbsp;', 'ünï', 'naïve',
	'&#8203;', '&#x200B;', '&ZeroWidthSpace;', '&#x4E00;', '&#19968;', '日本語', '漢', '字', '한국어', 'a\u200bb', '\u200b', 'x\u200b', '\u200by', 'a\u00a0b', 'x\fy', '\f', '😀', 'e\u0301',
	'Donaudampfschifffahrtsgesellschaft', 'https://example.org/a/b?c=d&amp;e=f', 'semi;colon', 'back`tick',
]

const attributeNames = [
	'class', 'id', 'title', 'lang', 'style', 'data-x', 'data-long-name', 'aria-label', 'dir', 'role', 'tabindex',
	'onclick', 'viewBox', 'xml:lang', 'DATA-Upper', 'x_y', '@click', ':bound',
]
const attributeValues = [
	'', 'a', 'x', '1', 'main', 'a b', 'two  spaces', ' padded ', 'line1\nline2', 'tab\there', 'a/b/', 'x/', 'q?a=1&amp;b=2',
	"it's", 'say "hi"', 'a>b', 'a<b', '</p>', '<!--', 'a=b', 'back`tick', 'ünï', '日本', 'color: red; margin: 0',
	'this value is long enough to push a start tag over a short line wrap', '\u00a0', 'a\fb',
]

const inlineContainers = [
	'span', 'em', 'strong', 'code', 'b', 'i', 'small', 'q', 'cite', 'abbr', 'sub', 'sup', 'kbd', 'mark', 'time', 'var', 'samp',
	'u', 's', 'dfn', 'bdi', 'data', 'my-element', 'x-tab', 'font', 'big', 'canvas', 'object', 'slot', 'template',
]
const interactiveContainers = ['a', 'label', 'button']
const flowContainers = ['div', 'div', 'section', 'article', 'aside', 'blockquote', 'nav', 'header', 'footer', 'main', 'center', 'dialog', 'search']
// Left out of D1, since a browser sees quad change them (oracle/cases.ts, the known differences): the attributes
// `hidden` and `popover`, a <dialog> without `open`, an element without content whose end tag is left out, an
// empty <body>
const phrasingBlocks = ['p', 'p', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'address']

// Content that a browser reads as text up to the element's end tag. None holds its own end tag.
const scripts = [
	'', 'x', '{"a":1}', 'let a = 1 < 2 && 3 > 2', '\n  if (a < b) {\n\tdocument.write("<p>" + a + "</p>")\n  }\n',
	'var s = "</scr" + "ipt>"', '<!--\nold();\n//-->', '<!--<script>x</script>-->', '<!-- <script> a </script> b -->\n',
	'  leading and trailing  ', '\r\n//# sourceMappingURL=a.js.map\r\n', '</div><div>', "'<pre>'",
]
const styles = ['', '.a{}', 'p > a { color: red }\n', '\n  /* </p> <div> */\n  body{margin:0}\n', '@media (min-width: 1px) {\n\ta { b: c }\n}']
const titles = ['', 'Title', 'a <b> c', '<T>', ' padded ', 'two  spaces', 'line1\n  line2', '&amp; &lt;', '</p>', '<!-- no comment -->', '</titl']
const textareas = ['', 'text', '\n\nleading lines', '  <b>bold</b>  ', '</p> </div>', '<!-- kept -->', 'a\n\tb\n', '<script>x</script>']
const rawTexts = ['', 'text', '<img src=a>', '<p>a</p>', ' a  b ', '<!-- c -->', 'a\nb']
// Without scripting a browser reads the content of <noscript> as markup, so it is phrasing content
const noscripts = ['', 'text', '<img src=a>', ' a  b ', '<!-- c -->']
// Verbatim regions inside each other (R-3 and R-4 of tests/findings.test.ts). Each holds the end tag of the region
// around it where a browser reads text: in raw text inside an integration point of foreign content, or in a CDATA
// section. What follows that end tag would change if quad formatted it.
export const nestedInPre = [
	'<svg><![CDATA[ a > b </pre> ]]><text>A  B</text></svg>  c',
	'<svg><foreignObject><textarea></pre>  </svg></textarea></foreignObject></svg>\n',
	'<math><mtext><textarea></pre>  </math></textarea></mtext></math>  x',
]
export const nestedInSvg = [
	'<foreignObject><textarea></svg> <P>a  b</P></textarea></foreignObject>',
	'<title><![CDATA[ a > b </title></svg> ]]></title>',
	'<desc><script>"</svg>"  +  1</script></desc>',
]
export const nestedInMath = [
	'<mi><textarea></math>  </mi></textarea></mi>',
	'<annotation-xml encoding="text/html"><textarea></math>  <DIV>a</DIV></textarea></annotation-xml>',
	'<annotation-xml encoding="image/svg+xml"><svg><foreignObject><xmp></math>  </svg></xmp></foreignObject></svg></annotation-xml>',
]
const preContents = [
	'', 'text', '\nfirst\n  second\n', '  a  b  ', '<b>bold</b>  <i>it</i>', 'a <code>x  y</code>\n', '<!-- </pre> -->x',
	'<span title="</pre>">x</span>', 'tab\there', '\n\n\nthree', 'a\r\nb', '<a href=x>y</a >', '&lt;div&gt;\n  &lt;/div&gt;',
	...nestedInPre,
]
const svgContents = [
	'', '<path d="M0 0"/>', '<circle cx="1" cy="1" r="1" />', '\n  <g>\n    <rect width="1" height="1"/>\n  </g>\n',
	'<text xml:space="preserve">A  B</text>', '<svg></svg><text>A  B</text>', '<svg><svg/></svg>  <path/>',
	'<![CDATA[ </svg> ]]>', '<!-- </svg> --><path/>', '<title>t</title><desc> d </desc>', '<a title="</svg>">x</a>',
	'<linearGradient gradientUnits="userSpaceOnUse"></linearGradient>', '<path d="M0 0\n         L1 1"/>',
	...nestedInSvg,
]
const mathContents = [
	'', '<mi>x</mi>', '<mi> x </mi><mo>+</mo><mn>1</mn>', '\n  <mrow>\n    <mi>a</mi>\n  </mrow>\n', '<math></math><mi>y</mi>',
	...nestedInMath,
]
const comments = ['<!---->', '<!-- c -->', '<!--c-->', '<!-- two\n     lines -->', '<!-- <p> -->', '<!-- a - b -->', '<!--[if IE]>x<![endif]-->']
const doctypes = ['<!DOCTYPE html>', '<!doctype html>', '<!DocType HTML>', '<!DOCTYPE html SYSTEM "about:legacy-compat">']

const lowerAscii = (text: string): string => text.replace(/[A-Z]/g, letter => letter.toLowerCase())

// Builds one conforming document and its facts
const createWriter = (random: Random) => {
	let source = ''
	const facts: Fact[] = []
	// The token before is a word or the tag of an inline element, with nothing but whitespace since
	let previousInline = false
	let whitespaceSince = false
	// Elements still allowed; it keeps a document small and its nesting shallow
	let budget = 12 + random.below(50)

	const whitespace = (required = false) => {
		let text = random.pick(whitespaceChoices)
		if (required && text === '') text = ' '
		source += text
		if (text !== '') whitespaceSince = true
	}

	// Adds one token: its source spelling and its facts. `inline` says whether W2 holds next to it.
	const token = (text: string, tokenFacts: Fact[], inline: boolean) => {
		tokenFacts[0]!.gap = inline && previousInline ? (whitespaceSince ? 'apart' : 'glued') : 'free'
		source += text
		facts.push(...tokenFacts)
		previousInline = inline
		whitespaceSince = false
	}

	const fact = (text: string, gap: Gap = 'glued', comment = false): Fact => ({ text, gap, comment })

	const spellName = (name: string): string => {
		const style = random.below(5)
		if (style < 3) return name
		if (style === 3) return name.toUpperCase()
		return name.replace(/[a-z]/g, letter => (random.chance(0.5) ? letter.toUpperCase() : letter))
	}

	const pickAttributes = (): Attribute[] => {
		const attributes: Attribute[] = []
		const count = random.chance(0.6) ? 0 : 1 + random.below(4)
		while (attributes.length < count) {
			const name = random.pick(attributeNames)
			if (attributes.some(attribute => attribute.name === name)) continue
			attributes.push({ name, value: random.chance(0.15) ? null : random.pick(attributeValues) })
		}
		return attributes
	}

	// A start tag in a random spelling the contract calls regular, and the facts of its normal form
	const startTag = (name: string, attributes: Attribute[], slash: 'void' | 'self-closing' | 'none'): [string, Fact[]] => {
		let text = '<' + spellName(name)
		const tagFacts = [fact('<' + lowerAscii(name))]
		let lastUnquoted = false
		for (const { name: attributeName, value } of attributes) {
			text += random.pick(whitespaceInTag) + attributeName
			lastUnquoted = false
			if (value === null) {
				tagFacts.push(fact(attributeName, 'apart'))
				continue
			}
			const equals = random.chance(0.15) ? ' = ' : '='
			const spellings = ['double', 'single', 'unquoted'].filter(spelling =>
				spelling === 'double' ? !value.includes('"') : spelling === 'single' ? !value.includes("'") : /^[^\t\n\f\r "'<=>`]+$/.test(value),
			)
			const spelling = random.pick(spellings)
			if (spelling === 'double') text += equals + '"' + value + '"'
			else if (spelling === 'single') text += equals + "'" + value + "'"
			else text += equals + value
			lastUnquoted = spelling === 'unquoted'
			// The value is copied; only the double quotes of a value that was in single quotes are escaped
			tagFacts.push(fact(attributeName + '="' + (spelling === 'single' ? value.replace(/"/g, '&quot;') : value) + '"', 'apart'))
		}
		const wantsSlash = slash === 'self-closing' || (slash === 'void' && random.chance(0.4))
		// Whitespace must part "/" from a value without quotes, or it would belong to the value
		if (random.chance(0.2) || (wantsSlash && lastUnquoted)) text += random.pick(whitespaceInTag)
		text += wantsSlash ? '/>' : '>'
		if (slash === 'self-closing') tagFacts.push(fact('/>', 'apart'))
		else tagFacts.push(fact('>'))
		return [text, tagFacts]
	}

	const endTag = (name: string): [string, Fact[]] => [
		'</' + spellName(name) + (random.chance(0.1) ? random.pick(whitespaceInTag) : '') + '>',
		[fact('</' + lowerAscii(name) + '>')],
	]

	const open = (name: string, inline: boolean, attributes = pickAttributes()) => {
		budget--
		token(...startTag(name, attributes, 'none'), inline)
	}
	const close = (name: string, inline: boolean) => token(...endTag(name), inline)
	// The end tag of an element that has content since `mark` may be left out before a sibling or the parent's end
	const closeOrLeaveOut = (name: string, mark: number) => {
		if (facts.length === mark || random.chance(0.8)) close(name, false)
	}
	const voidElement = (name: string, inline: boolean, attributes = pickAttributes()) => {
		budget--
		token(...startTag(name, attributes, 'void'), inline)
	}

	// An element whose content is copied: start tag, content and end tag are one token
	const verbatim = (name: string, content: string, inline: boolean, attributes = pickAttributes()) => {
		budget--
		const [startText, startFacts] = startTag(name, attributes, 'none')
		const [endText, endFacts] = endTag(name)
		const contentFacts = content === '' ? [] : [fact(content)]
		token(startText + content + endText, [...startFacts, ...contentFacts, ...endFacts], inline)
	}

	const comment = () => {
		const text = random.pick(comments)
		token(text, [fact(text, 'free', true)], false)
	}

	const word = () => {
		const text = random.pick(words)
		token(text, [fact(text)], true)
	}

	const script = () => verbatim('script', random.pick(scripts), false, random.chance(0.3) ? [{ name: 'type', value: 'application/json' }] : [])
	const style = () => verbatim('style', random.pick(styles), false, [])
	const meta = () => voidElement('meta', false, [{ name: 'name', value: 'a' }, { name: 'content', value: random.pick(attributeValues) }])
	const link = () => voidElement('link', false, [{ name: 'rel', value: 'stylesheet' }, { name: 'href', value: 'a.css' }])

	// Phrasing content. `interactive` is false inside <a>, <label> and <button>, which may not nest.
	const phrasing = (depth: number, interactive: boolean) => {
		let previousWasWord = false
		for (let items = 1 + random.below(6); items > 0; items--) {
			const choice = budget > 0 && depth < 6 ? random.below(100) : 0
			whitespace(previousWasWord && choice < 50)
			previousWasWord = choice < 50
			if (choice < 50) word()
			else if (choice < 68) {
				const name = interactive && random.chance(0.3) ? random.pick(interactiveContainers) : random.pick(inlineContainers)
				open(name, true)
				whitespace()
				if (random.chance(0.85)) phrasing(depth + 1, interactive && !interactiveContainers.includes(name))
				close(name, true)
			} else if (choice < 76) voidElement(random.pick(interactive ? ['br', 'wbr', 'img', 'input', 'embed'] : ['br', 'wbr', 'img']), true)
			else if (choice < 81) comment()
			else if (choice < 84) inlineSvg()
			else if (choice < 86) verbatim('math', random.pick(mathContents), true)
			else if (choice < 88 && interactive) verbatim('textarea', random.pick(textareas), true)
			else if (choice < 90) script()
			else if (choice < 91) style()
			else if (choice < 92) random.chance(0.5) ? meta() : link()
			else if (choice < 94) picture()
			else if (choice < 95 && interactive) media()
			else if (choice < 97 && interactive) select()
			else if (choice < 98) ruby()
			else if (interactive && random.chance(0.5)) verbatim(random.pick(['iframe', 'noembed']), random.pick(rawTexts), true)
			else verbatim('noscript', random.pick(noscripts), true)
		}
		whitespace()
	}

	const inlineSvg = () => {
		if (random.chance(0.15)) {
			budget--
			token(...startTag('svg', pickAttributes(), 'self-closing'), true)
		} else verbatim('svg', random.pick(svgContents), true)
	}

	const picture = () => {
		open('picture', true, [])
		whitespace()
		for (let sources = random.below(3); sources > 0; sources--) {
			voidElement('source', true, [{ name: 'srcset', value: 'a.webp' }])
			whitespace()
		}
		voidElement('img', true, [{ name: 'src', value: 'a.png' }, { name: 'alt', value: random.pick(attributeValues) }])
		whitespace()
		close('picture', true)
	}

	const media = () => {
		const name = random.pick(['video', 'audio'])
		open(name, true, [{ name: 'controls', value: null }])
		whitespace()
		for (let sources = random.below(3); sources > 0; sources--) {
			voidElement('source', true, [{ name: 'src', value: 'a' }])
			whitespace()
		}
		if (random.chance(0.3)) {
			voidElement('track', true, [{ name: 'src', value: 'a.vtt' }])
			whitespace()
		}
		close(name, true)
	}

	const option = () => {
		open('option', false)
		const mark = facts.length
		whitespace()
		if (random.chance(0.8)) {
			word()
			whitespace()
		}
		closeOrLeaveOut('option', mark)
		whitespace()
	}

	const select = () => {
		open('select', true)
		whitespace()
		for (let options = random.below(3); options > 0; options--) option()
		if (random.chance(0.3)) {
			open('optgroup', false, [{ name: 'label', value: 'g' }])
			whitespace()
			option()
			close('optgroup', false)
			whitespace()
		}
		close('select', true)
	}

	const ruby = () => {
		open('ruby', true, [])
		token('漢', [fact('漢')], true)
		whitespace()
		open('rp', true, [])
		token('(', [fact('(')], true)
		close('rp', true)
		open('rt', true, [])
		token('kan', [fact('kan')], true)
		close('rt', true)
		whitespace()
		close('ruby', true)
	}

	const list = (depth: number) => {
		const name = random.pick(['ul', 'ol', 'menu', 'dir'])
		open(name, false)
		whitespace()
		for (let items = random.below(4); items > 0; items--) {
			open('li', false)
			const mark = facts.length
			flow(depth + 1)
			closeOrLeaveOut('li', mark)
			whitespace()
			if (random.chance(0.1)) {
				comment()
				whitespace()
			}
		}
		close(name, false)
	}

	const descriptionList = (depth: number) => {
		open('dl', false)
		whitespace()
		for (let groups = random.below(3); groups > 0; groups--) {
			open('dt', false)
			whitespace()
			phrasing(depth + 1, true)
			close('dt', false)
			whitespace()
			open('dd', false)
			const mark = facts.length
			flow(depth + 1)
			closeOrLeaveOut('dd', mark)
			whitespace()
		}
		close('dl', false)
	}

	const tableRows = (depth: number) => {
		for (let rows = 1 + random.below(2); rows > 0; rows--) {
			open('tr', false)
			whitespace()
			for (let cells = 1 + random.below(3); cells > 0; cells--) {
				const name = random.pick(['td', 'td', 'th'])
				open(name, false)
				const mark = facts.length
				flow(depth + 2)
				closeOrLeaveOut(name, mark)
				whitespace()
			}
			close('tr', false)
			whitespace()
		}
	}

	const table = (depth: number) => {
		open('table', false)
		whitespace()
		if (random.chance(0.3)) {
			open('caption', false)
			whitespace()
			phrasing(depth + 1, true)
			close('caption', false)
			whitespace()
		}
		if (random.chance(0.3)) {
			open('colgroup', false)
			whitespace()
			voidElement('col', false)
			whitespace()
			close('colgroup', false)
			whitespace()
		}
		for (const section of ['thead', 'tbody', 'tfoot']) {
			if (section !== 'tbody' && random.chance(0.7)) continue
			open(section, false)
			whitespace()
			tableRows(depth)
			close(section, false)
			whitespace()
		}
		close('table', false)
	}

	// One block element
	const block = (depth: number) => {
		const choice = random.below(100)
		if (choice < 30) {
			const name = random.pick(phrasingBlocks)
			open(name, false)
			whitespace()
			if (random.chance(0.9)) phrasing(depth + 1, true)
			close(name, false)
		} else if (choice < 50) {
			const name = random.pick(flowContainers)
			if (name === 'dialog') open(name, false, [{ name: 'open', value: null }])
			else open(name, false)
			if (random.chance(0.9)) flow(depth + 1)
			else whitespace()
			close(name, false)
		} else if (choice < 60) list(depth)
		else if (choice < 66) table(depth)
		else if (choice < 70) descriptionList(depth)
		else if (choice < 78) verbatim(random.pick(['pre', 'pre', 'pre', 'listing']), random.pick(preContents), false)
		else if (choice < 80) verbatim('xmp', random.pick(rawTexts), false)
		else if (choice < 85) voidElement('hr', false)
		else if (choice < 89) {
			open('figure', false)
			flow(depth + 1)
			open('figcaption', false)
			whitespace()
			phrasing(depth + 1, true)
			close('figcaption', false)
			whitespace()
			close('figure', false)
		} else if (choice < 93) {
			open('details', false)
			whitespace()
			open('summary', false)
			whitespace()
			phrasing(depth + 1, true)
			close('summary', false)
			flow(depth + 1)
			close('details', false)
		} else if (choice < 97) {
			open('fieldset', false)
			whitespace()
			open('legend', false)
			whitespace()
			phrasing(depth + 1, true)
			close('legend', false)
			flow(depth + 1)
			close('fieldset', false)
		} else {
			open('hgroup', false)
			whitespace()
			open('h1', false)
			phrasing(depth + 1, true)
			close('h1', false)
			whitespace()
			close('hgroup', false)
		}
	}

	// Flow content: blocks and runs of phrasing content, with whitespace between them
	const flow = (depth: number) => {
		whitespace()
		for (let items = random.below(4); items > 0; items--) {
			if (budget > 0 && depth < 6 && random.chance(0.7)) block(depth)
			else phrasing(depth, true)
			whitespace()
		}
	}

	const head = () => {
		const omitTags = random.chance(0.25)
		if (!omitTags) open('head', false, [])
		whitespace()
		for (let items = random.below(6); items > 0; items--) {
			const choice = random.below(7)
			if (choice === 0) verbatim('title', random.pick(titles), false, [])
			else if (choice === 1) meta()
			else if (choice === 2) link()
			else if (choice === 3) script()
			else if (choice === 4) style()
			else if (choice === 5) voidElement('base', false, [{ name: 'href', value: '/' }])
			else comment()
			whitespace()
		}
		if (!omitTags) close('head', false)
	}

	const document = (): ConformingDocument => {
		whitespace()
		if (random.chance(0.5)) {
			const text = random.pick(doctypes)
			token(text, [fact('<!doctype' + text.slice(9), 'free')], false)
			whitespace()
		}
		if (random.chance(0.4)) flow(0)
		else {
			open('html', false, random.chance(0.5) ? [{ name: 'lang', value: 'en' }] : [])
			whitespace()
			head()
			whitespace()
			open('body', false)
			const mark = facts.length
			flow(0)
			if (facts.length === mark) word()
			if (random.chance(0.05)) {
				// <plaintext> never ends: the rest of the input is its content, and nothing may follow
				const rest = '<plaintext>' + random.pick(rawTexts) + ' </body>\n</html> '
				token(rest, [fact(rest, 'free')], false)
				return { source, facts }
			}
			close('body', false)
			whitespace()
			close('html', false)
			whitespace()
		}
		return { source, facts }
	}

	return document
}

// D1
export const conformingDocument = (random: Random): ConformingDocument => createWriter(random)()

const breakers = [
	'\u00a0', '"', "'", '<', '=', ' =', '/', '/x', '`', '\f', 'É', '\0', '>', '<!--', '<!', '<?', '</ ', '</>', '<![CDATA[', '-->',
	'<script>', '<pre>', '<svg>', '<textarea>', '<plaintext>', '</script>', '&', '\r',
]

// Markup that renders nothing, where no conforming document has it: a doctype after the start, the comments a
// browser makes of "<?…>", "<!…>" and "</ >", and comments next to them
const misplacedMarkup = ['<!doctype html>', '<!DOCTYPE>', '<?x?>', '<!x>', '</ >', '<!-->', '<!--c-->']

// D2: a D1 document with one to three faults. A fault cuts the document inside a tag, takes out a character of a
// tag, puts in one that makes the tag irregular, or puts misplaced markup directly before or after a tag.
export const brokenDocument = (random: Random): string => {
	let source = conformingDocument(random).source
	for (let faults = 1 + random.below(3); faults > 0; faults--) {
		const brackets: number[] = []
		for (let i = 0; i < source.length; i++) {
			const code = source.charCodeAt(i)
			if (code === 60 || code === 62) brackets.push(i)
		}
		if (brackets.length === 0) return source + random.pick(breakers)
		const bracket = random.pick(brackets)
		const kind = random.below(12)
		if (kind >= 10) {
			// One to three pieces with nothing between them and the tag: after its ">" or before its "<"
			const at = source.charCodeAt(bracket) === 62 ? bracket + 1 : bracket
			let markup = ''
			for (let count = 1 + random.below(3); count > 0; count--) markup += random.pick(misplacedMarkup)
			// Half of the time as all that an element of its own holds: that element has to stay empty
			if (random.chance(0.5)) markup = '<div>' + markup + '</div>'
			source = source.slice(0, at) + markup + source.slice(at)
			continue
		}
		// A place at a "<" or ">" or up to five characters after it
		const at = Math.min(source.length, bracket + random.below(6))
		if (kind === 0) source = source.slice(0, at)
		else if (kind < 3) source = source.slice(0, at) + source.slice(at + 1)
		else source = source.slice(0, at) + random.pick(breakers) + source.slice(at)
	}
	return source
}

const pieces = [
	'<', '<', '<', '>', '>', '/', '!', '?', '-', '--', '"', "'", '=', '`', ' ', ' ', '\n', '\r', '\t', '\f', '&', '#', ';', 'a', 'b', 'x',
	'A', 'É', '1', 'div', 'p', 'span', 'script', 'style', 'title', 'textarea', 'pre', 'listing', 'xmp', 'svg', 'math', 'plaintext',
	'iframe', 'noscript', 'html', 'head', 'body', 'br', 'wbr', 'meta', 'doctype', 'DOCTYPE', '<!--', '-->', '--!>', '<![CDATA[', ']]>',
	'</', '/>', '<a', '<p>', '</p>', '<div>', '</div>', '<pre>', '</pre>', '<script>', '</script>', '<svg>', '</svg>', '\u200b',
	'\u00a0', '日', '本', '\0', '😀', '\ud800', '\udc00', '\ufeff', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
]

// D3: an arbitrary string, from pieces of markup and from code units of the whole range
export const arbitraryString = (random: Random): string => {
	let text = ''
	for (let count = random.below(40); count > 0; count--) {
		text += random.chance(0.9) ? random.pick(pieces) : String.fromCharCode(random.below(0x10000))
	}
	return text
}

// The stress families: inputs whose size is one number, to show how work and output grow with it
export const stressFamilies: Record<string, (size: number) => string> = {
	'nesting depth': size => '<div>'.repeat(size),
	'nesting depth, closed': size => '<div>'.repeat(size) + '</div>'.repeat(size),
	'nesting depth with text': size => '<div>a '.repeat(size),
	'tag-name length × 40 attributes': size => '<' + 'a'.repeat(size) + ' aa=bb'.repeat(40) + '>',
	'attributes of one tag': size => '<div' + ' aa=bb'.repeat(size) + '>',
	'unclosed <script>': size => '<script>'.repeat(size),
	'unclosed <textarea>': size => '<textarea>'.repeat(size),
	'unclosed <pre>': size => '<pre>'.repeat(size),
	'unclosed <svg>': size => '<svg>'.repeat(size),
	'unclosed comments': size => '<!--'.repeat(size),
	'unclosed tags': size => '<a '.repeat(size),
	'quote runs': size => '<a b="'.repeat(size),
	'quote runs, mixed': size => '<a b=\'"'.repeat(size) + '>',
	'stray "<"': size => '< <'.repeat(size),
	'escaped scripts': size => '<script>' + '<!--<script>'.repeat(size),
	'long words': size => ('a'.repeat(200) + ' ').repeat(size),
}

export { createRandom }
