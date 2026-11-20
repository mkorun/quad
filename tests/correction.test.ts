import { describe, expect, it } from 'bun:test'
import htmlFmt from '../index.ts'
import { readFileSync } from 'node:fs'

describe('last review: character references at a wrap', () => {
	for (const reference of ['&#8203;', '&#x200B;', '&#X200b', '&#8203']) {
		it(`keeps a space next to encoded U+200B ${reference}, also across inline tags`, () => {
			const inputs = [
				`<p>aaaaaaaaaaaaaaaaaaaa${reference} b</p>`,
				`<p>aaaaaaaaaaaaaaaaaaaa <span>${reference}y</span></p>`,
				`<p><span>aaaaaaaaaaaaaaaaaaaa${reference}</span> <span>b</span></p>`,
			]
			for (const input of inputs) {
				const output = htmlFmt(input, { lineWrap: 20 })
				expect(output).toContain(input.slice(3, -4))
				expect(htmlFmt(output, { lineWrap: 20 })).toBe(output)
			}
		})
	}
	it('keeps a space between numeric wide characters, also across inline tags', () => {
		for (const [left, right] of [['&#x4E00;', '&#19968;'], ['一', '&#x4E00;'], ['&#x4E00;', '一'], ['&#x20000;', '&#131072;']]) {
			for (const content of [`aaaaaaaaaaaaaaaaaaaa${left} ${right}`, `aaaaaaaaaaaaaaaaaaaa${left} <span>${right}</span>`]) {
				expect(htmlFmt(`<p>${content}</p>`, { lineWrap: 20 })).toContain(content)
			}
		}
	})
	it('conservatively keeps spaces next to named references', () => {
		expect(htmlFmt('<p>aaaaaaaaaaaaaaaaaaaa&copy; b</p>', { lineWrap: 20 })).toContain('aaaaaaaaaaaaaaaaaaaa&copy; b')
	})
	it('still wraps next to a narrow numeric reference and after a reference followed by text', () => {
		for (const text of ['aaaaaaaaaaaaaaaaaaaa&#65;', 'aaaaaaaaaaaaaaaaaaaa&#8203;x']) {
			expect(htmlFmt(`<p>${text} b</p>`, { lineWrap: 20 })).toContain(text + '\n')
		}
	})
})

describe('last review: uncertain verbatim boundaries preserve the entire input', () => {
	it('does not resume formatting inside a script after an over-long foreign region', () => {
		const input = '<pre><svg></pre><script>const x = "</svg></pre><P>A  B</P>";</script>'
		expect(htmlFmt(input)).toBe(input)
	})
	it('does not add rendered whitespace after an over-long foreign region', () => {
		const input = '<pre><svg></pre>a</svg></pre>b'
		expect(htmlFmt(input)).toBe(input)
	})
	it('discards earlier formatting and comment removal when an inner region crosses an outer end', () => {
		for (const content of [
			'<pre><svg></pre>a</svg></pre>b',
			'<listing><math></listing>a</math></listing>b',
			'<svg><foreignObject>a</svg>b</foreignObject></svg>',
			'<math><mtext>a</math>b</mtext></math>',
		]) {
			const input = '<DIV  CLASS=x><!--remove me-->a  b</DIV>' + content
			for (const options of [{}, { stripComments: true }, { lineWrap: 20 }]) {
				expect(htmlFmt(input, options)).toBe(input)
				expect(htmlFmt(htmlFmt(input, options), options)).toBe(input)
			}
		}
	})
	it('formats before an unterminated region and copies its entire tail', () => {
		for (const region of [
			'<pre><svg>unterminated',
			'<svg><foreignObject><textarea>unterminated',
			'<pre><textarea>x',
			'<svg><title>x',
		]) {
			for (const options of [{}, { stripComments: true }, { lineWrap: 20 }]) {
				const output = htmlFmt('<P>A  B</P>' + region, options)
				expect(output).toBe('<p>A B</p>\n' + region)
				expect(htmlFmt(output, options)).toBe(output)
			}
		}
	})
	it('still formats around well-formed nested regions and hidden end tags', () => {
		const region = '<pre><svg><foreignObject><textarea></svg></textarea></foreignObject></svg></pre>'
		expect(htmlFmt('<DIV>a  b</DIV>' + region + '<P>c  d</P>')).toBe('<div>a b</div>\n' + region + '\n<p>c d</p>')
	})
})

describe('last review: R-8 misnested body and head preserve the entire input', () => {
	for (const input of [
		'<html><head></head><body>a</body>x</html>',
		'<html><head></head>x<body>a</body></html>',
		'<body>a<head></head>b</body>',
		'<body>a</body><p>b</p>',
		'<body>a<body>b</body>',
	]) {
		it(`preserves ${input}`, () => {
			for (const options of [{}, { stripComments: true }, { lineWrap: 20 }]) expect(htmlFmt(input, options)).toBe(input)
		})
	}
	it('formats the edge-cases fixture with either comment option', () => {
		const input = readFileSync(new URL('../differential/fixtures/edge-cases.html', import.meta.url), 'utf8')
		expect(htmlFmt(input)).not.toBe(input)
		expect(htmlFmt(input, { stripComments: true })).not.toBe(input)
	})
	it('still formats a normal head and body, including metadata', () => {
		expect(htmlFmt('<HTML><HEAD><TITLE>A</TITLE></HEAD><BODY><P>a  b</P></BODY></HTML>')).toBe('<html>\n\n<head>\n  <title>A</title>\n</head>\n\n<body>\n  <p>a b</p>\n</body>\n\n</html>')
	})
})

describe('last review: README script-data qualification', () => {
	it('qualifies the first script end tag for double-escaped script data', () => {
		const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8')
		expect(readme).toContain('In ordinary script data, `</script>` ends the script')
		expect(readme).toContain('an inner `</script>` leaves double escaping')
		expect(readme).not.toContain('A script ends at the first `</script>`')
		const script = '<script><!--<script></script>--></script>'
		expect(htmlFmt(script)).toBe(script)
	})
})


describe('release review: a leading byte order mark', () => {
	for (const document of [
		'<!DOCTYPE html><HTML><HEAD><TITLE>t</TITLE></HEAD><BODY><P>a  b</P></BODY></HTML>',
		'<body><P>a  b</P></body>',
	]) {
		it(`formats after the mark in ${document}`, () => {
			const input = '\ufeff' + document
			for (const options of [{}, { stripComments: true }]) {
				const output = htmlFmt(input, options)
				expect(output).toBe('\ufeff' + htmlFmt(document, options))
				expect(output).not.toBe(input)
				expect(htmlFmt(output, options)).toBe(output)
			}
		})
	}
})
