// One test per finding of the 2026-11-17 review (Q-1 to Q-8) and of the specification that followed it (N-1 to N-13):
// each one fails on 0.1.5. Then one per finding of the review of the rewrite, 2026-11-19 (R-1 to R-10, numbered in
// the order of that review). R-10 checks unchanged output only; it does not assert the readTag call count.
// The other behavioral regressions distinguish the reviewed rewrite, 88ef33e. The findings about the oracle
// itself are tested where the browser is (oracle/check.ts). The browser's verdict on these inputs is in oracle/cases.ts.

import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import htmlFmt from '../index.ts'
import type { HtmlFmtOptions } from '../index.ts'
import { htmlElementNames, isBlockForQuad, namesInReadme } from './element-names.ts'
import { leftMargins, outputBound } from './properties.ts'
import { knownDifferences } from '../oracle/cases.ts'

const expectUnchanged = (input: string, options?: HtmlFmtOptions) => expect(htmlFmt(input, options)).toBe(input)

const expectIdempotent = (input: string, options?: HtmlFmtOptions) => {
	const once = htmlFmt(input, options)
	expect(htmlFmt(once, options)).toBe(once)
}

describe('findings of the review', () => {

	it('Q-1: the content of <title> is text, not markup', () => {
		expectUnchanged('<title><T></title>')
		expectUnchanged('<title><D')
		expect(htmlFmt('<head><title>a <b> c</title></head>')).toBe('<head>\n  <title>a <b> c</title>\n</head>')
	})

	it('Q-2: wrapping adds no whitespace inside <label>, <button> or a custom element', () => {
		const word = 'a'.repeat(100)
		expect(htmlFmt(`<p><label>${word}</label>x</p>`)).toBe(`<p>\n  <label>${word}</label>x\n</p>`)
		expect(htmlFmt('<p><button>aaaaa</button>x</p>', { lineWrap: 20 })).toBe('<p>\n  <button>aaaaa</button>x\n</p>')
		expect(htmlFmt('<y><p><my-el>aaaaa</my-el>', { lineWrap: 40, indentation: '    ' })).toBe(
			'<y>\n<p><my-el>aaaaa</my-el>',
		)
	})

	it('Q-3: a nested <svg> does not end the verbatim content of the outer one', () => {
		expectUnchanged('<svg><svg></svg><text xml:space="preserve">A  B</text></svg>')
	})

	it('Q-4: stripComments reads <!--> as a whole comment and keeps what follows it', () => {
		expect(htmlFmt('<p>a<!-->b</p>', { stripComments: true })).toBe('<p>ab</p>')
		expect(htmlFmt('<p>baaaaa<!--> aaa', { stripComments: true })).toBe('<p>baaaaa aaa')
	})

	it('Q-5: an unterminated raw text or verbatim element gains no content at the end of the input', () => {
		for (const input of ['<pre>', '<textarea>', "<script '>a", '<style ">}', '<script a=><a']) expectUnchanged(input)
	})

	it('Q-6: a tag outside the grammar is copied, and read as a browser reads it', () => {
		// A "<" inside a tag is part of an attribute name, not the start of another tag
		expectUnchanged('<style <d>')
		expectUnchanged('<a <n>')
		expectUnchanged('<A  <b  >')
		// A no-break space is not whitespace: it belongs to the tag name
		expectUnchanged('<script\u00a0>')
		expectUnchanged('<a\u00a0>')
		// A quote opens a value only after "="
		expectUnchanged('<a">a >')
		expectUnchanged('<a =>')
		expectUnchanged('<a/a> a')
		// Bogus comments run to the first ">", or to the end of the input
		for (const input of ['<a><! ', '<a><? ', '<a></ ']) expectUnchanged(input)
		// "/>" does not close a script
		expectUnchanged('<script/><R')
		// No whitespace appears before inline <svg> or around a misplaced doctype
		expectUnchanged('<a>a</o><svg>')
		expectUnchanged('<a><!doctype>a')
	})

	it('Q-7: formatting twice gives the same as formatting once', () => {
		expectIdempotent('a aaaaa>aaaaaaaaaaaaaaa', { lineWrap: 20 })
		for (const input of ['<d><\n \na', 'a\r\r\na', '<html', '<pre', '<textarea', '<svg', '<a><a=']) expectIdempotent(input)
		for (const input of ['>\n<!--', 'a <!--', 'a <!--c-->']) expectIdempotent(input, { stripComments: true })
		expect(htmlFmt('a <!--c-->', { stripComments: true })).toBe('a')
	})

	it('Q-8: the output grows linearly with the nesting depth', () => {
		const input = '<div>'.repeat(2000)
		const output = htmlFmt(input)
		expect(output.length).toBeLessThanOrEqual(outputBound(input, 120))
		expect(Math.max(...leftMargins(output))).toBe(60)
	})

})

describe('findings of the specification', () => {

	it('N-1: a line break or tab inside an attribute value is kept', () => {
		expectUnchanged('<a title="line1\nline2\tx">')
	})

	it('N-2: a "/" at the end of an unquoted value belongs to the value', () => {
		expect(htmlFmt('<a href=x/>')).toBe('<a href="x/">')
	})

	it('N-3: a nested <pre> does not end the verbatim content of the outer one', () => {
		expectUnchanged('<pre>a<pre>b</pre> c  d</pre>')
	})

	it('N-4: no whitespace appears around a script or style element inside text', () => {
		expectUnchanged('<p>a<script>x</script>b</p>')
		expectUnchanged('<p><span>a</span><style>.x{}</style>b</p>')
	})

	it('N-5: no whitespace appears inside <picture>, <video> or <math>', () => {
		expectUnchanged('<p>x<picture><source><img></picture>y</p>')
		expectUnchanged('<p>a<math><mi> x </mi></math>b</p>')
		expect(htmlFmt('<p><video><source src=a></video></p>')).toBe('<p><video><source src="a"></video></p>')
	})

	it('N-6: the content of a script is copied byte for byte', () => {
		expectUnchanged('<script type="application/json">{"a":1}</script>')
	})

	it('N-7: stripComments keeps a comment whose removal would create a tag or a character reference', () => {
		expectUnchanged('<p>a<<!--c-->/p>b', { stripComments: true })
		expectUnchanged('<p>&am<!--c-->p;</p>', { stripComments: true })
		expectUnchanged('<p>&#<!--c-->38;</p>', { stripComments: true })
		// With whitespace on either side nothing can join
		expect(htmlFmt('<p>a< <!--c-->/p>b', { stripComments: true })).toBe('<p>a< /p>b')
		expect(htmlFmt('<p>&am<!--c--> p;</p>', { stripComments: true })).toBe('<p>&am p;</p>')
	})

	it('N-8: an element with only whitespace keeps whitespace, an empty one stays empty', () => {
		expect(htmlFmt('<div> </div>')).toBe('<div>\n</div>')
		expectUnchanged('<div></div>')
		expectUnchanged(`<div class="${'a'.repeat(130)}"></div>`)
		expectUnchanged('<div><!--c--></div>')
		expect(htmlFmt('<ul><li> </ul>')).toBe('<ul>\n  <li>\n  </ul>')
		expect(htmlFmt('<p> ')).toBe('<p>\n')
	})

	it('N-9: a form feed in text is a character, not whitespace', () => {
		expectUnchanged('<p><em>x</em>\fy</p>')
	})

	it('N-10: a space after <wbr> or next to U+200B does not become a line break', () => {
		expect(htmlFmt('<p>a<wbr> b c d e f g h i j k l m n o p</p>', { lineWrap: 20 })).toBe(
			'<p>\n  a<wbr> b c d e f g\n  h i j k l m n o p\n</p>',
		)
		expect(htmlFmt('<p>aaaaaaaaaaaaaaaaaaaaa\u200b b</p>', { lineWrap: 20 })).toBe(
			'<p>\n  aaaaaaaaaaaaaaaaaaaaa\u200b b\n</p>',
		)
	})

	it('N-11: only ASCII letters of a tag name are lowercased', () => {
		expectUnchanged('<x-É>')
		expect(htmlFmt('<X-A>')).toBe('<x-a>')
	})

	it('N-12: valid input with <picture> or <noscript> is formatted the same twice', () => {
		expectIdempotent('<figure><picture><source srcset=a><img src=b></picture></figure>')
		expectIdempotent('<noscript><img src=a></noscript>')
	})

	it('N-13: a long tag name does not multiply the output by its attributes', () => {
		const input = '<' + 'a'.repeat(2000) + ' aa=bb'.repeat(40) + '>'
		const output = htmlFmt(input)
		expect(output.length).toBeLessThanOrEqual(outputBound(input, 120))
		expect(Math.max(...leftMargins(output))).toBe(60)
	})

})

describe('findings of the review of the rewrite', () => {

	it('R-1: a doctype next to a comment, as all an open block holds, gets no space and is formatted the same twice', () => {
		// For a browser the element is empty: a doctype there is dropped, a comment does not count
		for (const input of [
			'<div><!--><!doctype html></div>', '<div><!doctype html><!--></div>', '<div><?x?><!doctype html>',
			'<div><!doctype html><!doctype html></div>', '<li><!--c--><!x><!doctype html></ ></li>',
		]) expectUnchanged(input)
		// With whitespace in the source the element is not empty, and each takes a line of its own
		const lines = '<div>\n  <!--c-->\n  <!doctype html>\n</div>'
		expect(htmlFmt('<div><!--c--> <!doctype html></div>')).toBe(lines)
		expectUnchanged(lines)
	})

	it('R-2: a block element with the attribute popover is a known difference, with its case for the oracle', () => {
		// Hidden by the default stylesheet until it is opened, like `hidden`: the line breaks around it render
		// between the text on both sides. This is what quad writes today, not what would be right.
		const input = '<p>a</p>b<div popover>x</div>c'
		expect(htmlFmt(input)).toBe('<p>a</p>\nb\n<div popover>x</div>\nc')
		expect(knownDifferences.map(known => known.input)).toContain(input)
		expect(readFileSync(join(import.meta.dir, '../README.md'), 'utf-8')).toContain('an element with the attribute `popover`')
	})

	it('R-3: nested foreign regions hide end tags or preserve uncertain input', () => {
		// The review's inputs: for a browser the first </pre> stands in an integration point, which it cannot leave
		for (const input of [
			'<pre><math><mi>a</pre>b</mi></math></pre>',
			'<pre><svg><foreignObject>a</pre>b</foreignObject></svg></pre>',
			'<pre><svg><desc>a</pre>b</desc></svg></pre>',
			'<pre><math><annotation-xml encoding="text/html">a</pre>b</annotation-xml></math></pre>',
			'<pre><svg><foreignObject></pre></foreignObject></svg></pre>',
			'<listing><svg><title>a</listing>  b</title></svg></listing>',
		]) expectUnchanged(input)
		// A CDATA section exists in foreign content only: in <svg> it hides the end tag, directly in <pre> a browser
		// makes a comment of it that ends at the first ">"
		expectUnchanged('<pre><svg><![CDATA[ a > b </pre> ]]></svg>  c  d</pre>')
		expect(htmlFmt('<pre><![CDATA[ a > b </pre>  c  d')).toBe('<pre><![CDATA[ a > b </pre>\nc d')
		// "/>" closes <svg> and <math>, so no region opens
		expect(htmlFmt('<pre><svg/><math/></pre><p>a  b</p>')).toBe('<pre><svg/><math/></pre>\n<p>a b</p>')
		// An outer end tag before the inner region ends is uncertain: the entire input stays unchanged.
		expectUnchanged('<pre><svg><g>a</pre>  b</g></svg></pre>')
		expectUnchanged('<pre><svg></pre><p>a  b</p>')
	})

	it('R-4: raw text in an integration point of <svg> or <math> hides the end tag of the region', () => {
		for (const input of [
			// The review's inputs, and the same with the other elements whose content is text
			'<svg><foreignObject><textarea></svg><DIV>a</DIV></textarea></foreignObject></svg>',
			'<math><annotation-xml encoding="text/html"><textarea></math><DIV>a</DIV></textarea></annotation-xml></math>',
			'<svg><foreignObject><script>"</svg>"  +  1</script><style></svg>  {}</style></foreignObject></svg>',
			'<svg><desc><xmp></svg>  </desc></xmp></desc><title><iframe></svg>  </title></iframe></title></svg>',
			// <title> in the content of the <title> of SVG is the one of HTML: its end tag does not end the outer one
			'<svg><title><title></svg>  </title></title></svg>',
			'<math><mi><textarea></math>  </mi></textarea></mi><mo><noembed></math>  </noembed></mo></math>',
			'<math><mn><noframes></math>  </noframes></mn><ms><style></math>  </style></ms><mtext><title></math>  </title></mtext></math>',
			// In <annotation-xml> a browser reads <svg> as SVG, whatever the encoding
			'<math><annotation-xml encoding="image/svg+xml"><svg><foreignObject><xmp></math>  </svg></xmp></foreignObject></svg></annotation-xml></math>',
			// Directly in an integration point a CDATA section is still one
			'<svg><title><![CDATA[ a > b </title></svg>  <P>x</P> ]]></title></svg>',
			// <plaintext> there never ends
			'<svg><foreignObject><plaintext></foreignObject></svg><P>a  b</P>',
			// An element of HTML with the name of the region is counted, as in <pre>
			'<svg><desc><desc></desc></svg>  </desc></svg>',
		]) expectUnchanged(input)
		// Outside an integration point foreign content has no raw text: a browser ends <svg> at this </svg>
		expect(htmlFmt('<svg><textarea></svg><DIV>a</DIV>')).toBe('<svg><textarea></svg>\n<div>a</div>')
		// "/>" closes an integration point, as every element of foreign content
		expect(htmlFmt('<svg><foreignObject/><textarea></svg><DIV>a</DIV>')).toBe('<svg><foreignObject/><textarea></svg>\n<div>a</div>')
		// The outer </svg> before </foreignObject> is an uncertain boundary: preserve the entire input.
		expectUnchanged('<svg><foreignObject>a</svg><P>a  b</P>')
	})

	it('R-7: the output ends in whitespace only where the contract keeps it, as the CHANGELOG says', () => {
		expect(htmlFmt('\n <p>a</p> \n\n')).toBe('<p>a</p>')
		// Whitespace as all an open block holds stays whitespace; input that ends inside a construct is copied to its end
		expect(htmlFmt('<p> ')).toBe('<p>\n')
		expectUnchanged('<pre>\n')
		expectUnchanged('a<!-- \n')
		const changelog = readFileSync(join(import.meta.dir, '../CHANGELOG.md'), 'utf-8')
		expect(changelog.includes('The output has no line break at its start or end.')).toBe(false)
		expect(changelog.includes('(`<p> ` → `<p>⏎`)')).toBe(true)
	})

	it('R-8: text after </body> and misplaced <head> or <body> preserve the input', () => {
		for (const input of [
			'<html><head></head><body>a</body>x</html>',
			'<html><head></head>x<body>a</body></html>',
			'<body>a<head></head>b</body>',
		]) expectUnchanged(input)
	})

	it('R-10: an irregular long tag is copied regardless of lineWrap, while a regular tag wraps', () => {
		// The finding is about work, not output: this holds on the reviewed rewrite too, which read such a tag twice
		const tag = '<div class="a"id="b" ' + 'data-x=1 '.repeat(30) + '>'
		for (const lineWrap of [0, 20, 120]) expect(htmlFmt(tag + 'a</div>', { lineWrap })).toStartWith(tag)
		expect(htmlFmt('<div ' + 'data-x=1 '.repeat(30) + '>', { lineWrap: 40 })).toContain('<div data-x="1"\n     data-x="1"\n')
	})

})

describe('the table of elements', () => {

	it('is the same in the README and in quad, for every HTML element name', () => {
		const blocks = new Set([...namesInReadme('Block'), ...namesInReadme('`pre`, `listing`'), 'xmp', 'plaintext'])
		expect(blocks.size).toBe(58)
		for (const name of new Set([...htmlElementNames(), ...blocks, 'my-element'])) expect([name, isBlockForQuad(name)]).toEqual([name, blocks.has(name)])
	})

	it('has void elements that lose their "/" and take no content', () => {
		for (const name of namesInReadme('Void')) expect(htmlFmt(`<${name}/>`)).toBe(`<${name}>`)
		expect(namesInReadme('Void')).toHaveLength(13)
	})

})
