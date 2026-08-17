import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import htmlFmt from '../index'

describe('htmlFmt — basic formatting', () => {

	it('returns empty string for empty input', () => {
		expect(htmlFmt('')).toBe('')
	})

	it('formats a minimal HTML document', () => {
		const input = '<html><head></head><body><p>text</p></body></html>'
		expect(htmlFmt(input)).toBe(
			'<html>\n\n<head></head>\n\n<body>\n  <p>text</p>\n</body>\n\n</html>',
		)
	})

	it('indents nested elements', () => {
		expect(htmlFmt('<div><p>hello</p></div>')).toBe('<div>\n  <p>hello</p>\n</div>')
	})

	it('handles multiple siblings at same depth', () => {
		const result = htmlFmt('<ul><li>A</li><li>B</li><li>C</li></ul>')
		expect(result).toContain('  <li>A</li>')
		expect(result).toContain('  <li>B</li>')
		expect(result).toContain('  <li>C</li>')
	})

	it('uses custom indentation', () => {
		const result = htmlFmt('<div><p>text</p></div>', { indentation: '\t' })
		expect(result).toBe('<div>\n\t<p>text</p>\n</div>')
	})

})

describe('htmlFmt — HTML-only whitespace trimming', () => {

	// Regression: text-node trimming used JavaScript's String.prototype.trim(), which strips
	// more than HTML's own "ASCII whitespace" definition — notably NBSP (U+00A0), a meaningful,
	// visible character (renders as a non-breaking space, e.g. "10 km"). Only real HTML
	// whitespace (tab, LF, FF, CR, space) may be trimmed/collapsed.

	const nbsp = '\u00A0'

	it('preserves a leading non-breaking space', () => {
		expect(htmlFmt(`<p>${nbsp}hello</p>`)).toBe(`<p>${nbsp}hello</p>`)
	})

	it('preserves a trailing non-breaking space', () => {
		expect(htmlFmt(`<p>hello${nbsp}</p>`)).toBe(`<p>hello${nbsp}</p>`)
	})

	it('preserves a non-breaking space between words', () => {
		expect(htmlFmt(`<p>10${nbsp}km</p>`)).toBe(`<p>10${nbsp}km</p>`)
	})

})

describe('htmlFmt — void elements', () => {

	it('does not increase depth for <br>', () => {
		const result = htmlFmt('<div><br><p>after</p></div>')
		expect(result).toContain('  <br>')
		expect(result).toContain('  <p>after</p>')
	})

	it('does not increase depth for <img>', () => {
		const result = htmlFmt('<div><img src="x.png" alt="x"></div>')
		expect(result).toContain('  <img src="x.png" alt="x">')
		expect(result).not.toContain('    ')
	})

	it('does not increase depth for <input>', () => {
		const result = htmlFmt('<form><input type="text"></form>')
		expect(result).toContain('  <input type="text">')
	})

	it('does not increase depth for <meta>', () => {
		const result = htmlFmt('<head><meta charset="utf-8"></head>')
		expect(result).toContain('  <meta charset="utf-8">')
	})

	it('handles self-closing tags', () => {
		const result = htmlFmt('<div><path d="M0 0" /></div>')
		expect(result).toContain('  <path d="M0 0" />')
	})

})

describe('htmlFmt — HTML comments', () => {

	it('preserves comment content', () => {
		const result = htmlFmt('<div><!-- hello world --><p>text</p></div>')
		expect(result).toContain('<!-- hello world -->')
	})

	it('preserves multi-word comments', () => {
		const result = htmlFmt('<!-- build: 2026-01-01 --><html></html>')
		expect(result).toContain('<!-- build: 2026-01-01 -->')
	})

	it('does not add trailing space after comment closing -->', () => {
		// regression: whitespace after --> triggered prevTag==='--' and pushed a spurious space
		const result = htmlFmt('<head><!-- a comment -->\n<meta charset="utf-8"></head>')
		expect(result).not.toMatch(/-->\s+\n/)
		expect(result).toContain('<!-- a comment -->\n')
	})

	it('does not invent word spacing around a rendering-transparent comment', () => {
		expect(htmlFmt('<p>a<!-- c --><em>b</em></p>')).toBe('<p>a<!-- c --><em>b</em></p>')
		expect(htmlFmt('<p><em>a</em><!-- c -->b</p>')).toBe('<p><em>a</em><!-- c -->b</p>')
		expect(htmlFmt('<p><em>a</em> <!-- c -->b</p>')).toBe('<p><em>a</em> <!-- c -->b</p>')
	})

})

describe('htmlFmt — stripComments option', () => {

	it('removes a single inline comment', () => {
		const result = htmlFmt('<div><!-- hello world --><p>text</p></div>', { stripComments: true })
		expect(result).not.toContain('<!--')
		expect(result).toContain('<p>text</p>')
	})

	it('removes multiple comments', () => {
		const result = htmlFmt('<div><!-- one --><p>text</p><!-- two --></div>', { stripComments: true })
		expect(result).not.toContain('<!--')
		expect(result).toContain('<p>text</p>')
	})

	it('removes a leading comment before <html>', () => {
		const result = htmlFmt('<!-- build: 2026-01-01 --><html><body><p>hi</p></body></html>', { stripComments: true })
		expect(result).not.toContain('<!--')
		expect(result).toContain('<html>')
	})

	it('preserves surrounding elements when comment is stripped', () => {
		const result = htmlFmt('<ul><li>a</li><!-- item --><li>b</li></ul>', { stripComments: true })
		expect(result).not.toContain('<!--')
		expect(result).toContain('<li>a</li>')
		expect(result).toContain('<li>b</li>')
	})

	it('preserves comments when stripComments is false (default)', () => {
		const result = htmlFmt('<div><!-- keep me --></div>')
		expect(result).toContain('<!-- keep me -->')
	})

})

describe('htmlFmt — script and style preservation', () => {

	it('preserves <script> content without reformatting', () => {
		const input = '<head><script>var x = 1;\nvar y = 2;</script></head>'
		const result = htmlFmt(input)
		expect(result).toContain('var x = 1;')
		expect(result).toContain('var y = 2;')
	})

	it('preserves <style> content without reformatting', () => {
		const input = '<head><style>body { margin: 0; }\np { color: red; }</style></head>'
		const result = htmlFmt(input)
		expect(result).toContain('body { margin: 0; }')
		expect(result).toContain('p { color: red; }')
	})

	it('preserves <script src="..."> content', () => {
		const input = '<head><script src="app.js">/* inline */</script></head>'
		const result = htmlFmt(input)
		expect(result).toContain('/* inline */')
	})

	// ── JSON-LD / multi-line script content ──

	it('preserves script content byte-for-byte — no reindentation', () => {
		// Regression: an earlier version reindented <script> content to match the surrounding
		// HTML depth, but doing that safely is impossible without a real JS parser — it can add
		// indentation inside a multi-line template literal, changing the string's runtime value
		// (e.g. `first\nsecond` becoming `first\n    second`). quad no longer touches this content
		// at all beyond stripping the single boundary newline next to each tag (see the two tests
		// below) — the JSON's own original 2-space indentation must survive completely unchanged.
		const json = '{\n  "@context": "https://schema.org",\n  "@type": "BlogPosting"\n}'
		const input = `<head><script type="application/ld+json">${json}\n</script></head>`
		const result = htmlFmt(input)
		expect(result).toContain(json)
	})

	it('does not add indentation inside a multi-line template literal', () => {
		const input = '<div><script>const value = `first\nsecond`;</script></div>'
		const result = htmlFmt(input)
		expect(result).toContain('`first\nsecond`;')
	})

	it('places </script> on its own line after multi-line content', () => {
		const json = '{\n  "key": "value"\n}'
		const input = `<head><script type="application/ld+json">${json}\n</script></head>`
		const result = htmlFmt(input)
		// closing tag must not be on the same line as the last content line
		expect(result).not.toMatch(/\}[^\n]*<\/script>/)
		expect(result).toMatch(/\}\n\s*<\/script>/)
	})

	it('does not insert extra blank line between <script> tag and JSON content', () => {
		const json = '{\n  "key": "value"\n}'
		const input = `<head><script type="application/ld+json">${json}\n</script></head>`
		const result = htmlFmt(input)
		// after <script ...> there must be exactly one newline before {, not two
		expect(result).not.toMatch(/<script[^>]*>\n\n/)
	})

	it('preserves full JSON-LD block with nested objects', () => {
		const ld = JSON.stringify({
			'@context': 'https://schema.org',
			'@type': 'BlogPosting',
			headline: 'Test',
			author: { '@type': 'Person', name: 'Alice' },
			publisher: { '@type': 'Organization', name: 'Acme', url: 'https://acme.com' },
		}, null, 2)
		const input = `<head><script type="application/ld+json">${ld}\n</script></head>`
		const result = htmlFmt(input)
		expect(result).toContain('"@context": "https://schema.org"')
		expect(result).toContain('"author": {')
		expect(result).toContain('"@type": "Person"')
		expect(result).toContain('"publisher": {')
		// outer braces must survive
		expect(result).toMatch(/^\s*\{/m)
		expect(result).toMatch(/^\s*\}\s*\n\s*<\/script>/m)
	})

	it('collapses empty <script src="..."></script> to a single line', () => {
		// regression: </script> was landing at column 0 without indentation
		const result = htmlFmt('<head><script src="/assets/js/app.js"></script></head>')
		expect(result).toContain('<script src="/assets/js/app.js"></script>')
		expect(result).not.toMatch(/<script[^>]*>\n<\/script>/)
	})

	it('indents </script> at the correct HTML level after multi-line content', () => {
		const ld = JSON.stringify({ '@context': 'https://schema.org', '@type': 'BlogPosting' }, null, 2)
		const input = `<head><script type="application/ld+json">${ld}\n</script></head>`
		const result = htmlFmt(input)
		// </script> must be at the same indentation as <script>, not at column 0
		expect(result).toContain('  </script>')
		expect(result).not.toMatch(/\n<\/script>/)
	})

	it('collapses empty <style> to a single line', () => {
		const result = htmlFmt('<head><style></style></head>')
		expect(result).toContain('<style></style>')
		expect(result).not.toMatch(/<style[^>]*>\n<\/style>/)
	})

})

describe('htmlFmt — block closing tag after inline element', () => {

	it('keeps </li> on the same line when content is a single <a>', () => {
		// regression: empty text part between </a> and </li> was resetting prevContent,
		// causing </li> to be placed on its own line
		const result = htmlFmt('<ul><li><a href="#foo">Link</a></li></ul>')
		expect(result).toContain('<li><a href="#foo">Link</a></li>')
	})

	it('keeps </li> on the same line for multiple items', () => {
		const result = htmlFmt('<ol><li><a href="#a">A</a></li><li><a href="#b">B</a></li></ol>')
		expect(result).toContain('<li><a href="#a">A</a></li>')
		expect(result).toContain('<li><a href="#b">B</a></li>')
	})

	it('keeps </p> on the same line when it ends with an inline element', () => {
		const result = htmlFmt('<p>Text with <em>italic</em></p>')
		expect(result).toBe('<p>Text with <em>italic</em></p>')
	})

	it('still places </div> on its own line after a nested <p>', () => {
		// block closing tag after a closing block tag must NOT stay on the same line
		const result = htmlFmt('<div><p>text</p></div>')
		expect(result).toBe('<div>\n  <p>text</p>\n</div>')
	})

	it('does not insert a space before a closing block tag that follows an inline element', () => {
		// galley produces <li><a>text</a>\n  </li> — the whitespace gap must not
		// become a space before </li>
		const result = htmlFmt('<ul><li><a href="#x">Link</a>\n  </li></ul>')
		expect(result).toContain('<li><a href="#x">Link</a></li>')
		expect(result).not.toContain('<a href="#x">Link</a> </li>')
	})

	it('still preserves space between two adjacent inline elements', () => {
		const result = htmlFmt('<p><em>italic</em> <strong>bold</strong></p>')
		expect(result).toContain('</em> <strong>')
	})

})

describe('htmlFmt — textarea preservation', () => {

	it('preserves textarea content including whitespace', () => {
		const input = '<form><textarea>  keep\n  this\n  as-is  </textarea></form>'
		const result = htmlFmt(input)
		expect(result).toContain('  keep\n  this\n  as-is  ')
	})

})

describe('htmlFmt — long tag wrapping', () => {

	it('wraps tag attributes when tag exceeds lineWrap', () => {
		const input = '<div class="one" data-value="foo" id="bar" aria-label="something">text</div>'
		const result = htmlFmt(input, { lineWrap: 40 })
		// Attributes should be split across lines
		expect(result).toContain('\n')
		expect(result).toContain('class="one"')
		expect(result).toContain('data-value="foo"')
	})

	it('does not wrap tag when it fits within lineWrap', () => {
		const input = '<p class="short">text</p>'
		const result = htmlFmt(input, { lineWrap: 120 })
		expect(result).not.toContain('\n     ')
	})

	it('does not leave a trailing space before the newline on wrapped attribute lines', () => {
		const input = '<div class="one" data-value="foo" id="bar" aria-label="something">text</div>'
		const result = htmlFmt(input, { lineWrap: 40 })
		expect(result).not.toMatch(/ \n/)
	})

})

describe('htmlFmt — tag normalization', () => {

	it('normalizes whitespace inside tags', () => {
		const result = htmlFmt('<div  class="foo"  id="bar">text</div>')
		expect(result).not.toContain('  class')
	})

	it('removes trailing slash from void elements', () => {
		expect(htmlFmt('<input type="text"/>')).toContain('<input type="text">')
		expect(htmlFmt('<br />')).toContain('<br>')
		expect(htmlFmt('<img src="x.png" alt="" />')).toContain('<img src="x.png" alt="">')
	})

	it('collapses 3+ spaces inside tags to single space (regression)', () => {
		// <body\n  class="..."> → after \r\n\t→space: "body   class" — must collapse to single space
		const result = htmlFmt('<body\n  class="foo bar">text</body>')
		expect(result).not.toContain('  class')
		expect(result).toContain('class="foo bar"')
	})

	it('collapses all whitespace before self-closing markers (regression)', () => {
		expect(htmlFmt('<div><custom-element   /></div>')).toBe(
			'<div>\n  <custom-element />\n</div>',
		)
	})

})

describe('htmlFmt — indentation clamp (regression)', () => {

	it('does not crash when closing tags outnumber opening tags', () => {
		// Markdown-generated HTML can produce unbalanced structures
		expect(() => htmlFmt('<div></div></div></div>')).not.toThrow()
	})

	it('does not crash on deeply nested list from Markdown', () => {
		const input = '<ul><li>A<ul><li>B<ul><li>C</li></ul></li></ul></li></ul>'
		expect(() => htmlFmt(input)).not.toThrow()
		expect(htmlFmt(input)).toContain('C')
	})

})

describe('htmlFmt — multiline text content', () => {

	it('wraps long text content at lineWrap boundary', () => {
		const longText = 'word1 word2 word3 word4 word5 word6 word7 word8 word9 word10'
		const input = `<p>${longText}</p>`
		const result = htmlFmt(input, { lineWrap: 30 })
		expect(result).toContain('\n')
	})

	it('preserves short single-line content inline', () => {
		const result = htmlFmt('<p>short text</p>', { lineWrap: 120 })
		expect(result).toBe('<p>short text</p>')
	})

})

describe('htmlFmt — pre preservation', () => {

	it('preserves <pre> content including inner tags', () => {
		const input = '<div><pre><span class="k">var</span> foo = <span class="s">"bar"</span>;</pre></div>'
		const result = htmlFmt(input)
		// Spaces between spans must be preserved — they are significant in <pre>
		expect(result).toContain('<span class="k">var</span> foo = <span class="s">"bar"</span>;')
	})

	it('preserves <pre class="..."> content', () => {
		const input = '<pre class="hljs">line one\nline two\n</pre>'
		const result = htmlFmt(input)
		expect(result).toContain('line one\nline two\n')
	})

	it('does not add indentation inside <pre> content', () => {
		const input = '<div><pre>  indented\n  code\n</pre></div>'
		const result = htmlFmt(input)
		// Inner indentation must stay exactly as-is
		expect(result).toContain('<pre>  indented\n  code\n</pre>')
	})

})

describe('htmlFmt — inline elements', () => {

	it('preserves space before inline element', () => {
		const result = htmlFmt('<p>Some <em>italic</em> text.</p>')
		expect(result).toBe('<p>Some <em>italic</em> text.</p>')
	})

	it('does not insert a space before an inline element when the source has none (regression)', () => {
		// Found via the differential test suite: the code deciding whether to restore a space
		// before an inline opening tag guessed from the last *emitted* character instead of
		// checking whether the source text actually had trailing whitespace — "Leading<em>"
		// (no space in source) was incorrectly turning into "Leading <em>".
		const result = htmlFmt('<p>Leading<em>x</em>and<em>y</em>trailing.</p>')
		expect(result).toBe('<p>Leading<em>x</em>and<em>y</em>trailing.</p>')
	})

	it('keeps inline content attached to a tag that wrapped across multiple lines (regression)', () => {
		// The "fits on one line" check used a neighboring token's raw source length, which for a
		// long attribute list that just got wrapped across several lines is far bigger than what
		// actually remains on the current visual line — forcing "Click here" onto an unwanted new
		// line even though it fits easily right after the tag's last wrapped line.
		const input = '<a class="btn btn-primary btn-large" href="/some/very/long/path/that/is/quite/long" data-tracking-id="header-nav-cta-x" data-analytics-category="navigation">Click here</a>'
		const result = htmlFmt(input)
		expect(result).toContain('">Click here</a>')
		expect(result).not.toContain('>\nClick here')
	})

	it('preserves space after inline element', () => {
		const result = htmlFmt('<p><em>First</em> word.</p>')
		expect(result).toBe('<p><em>First</em> word.</p>')
	})

	it('preserves every HTML whitespace kind after a closing inline element', () => {
		for (const whitespace of [' ', '\t', '\n', '\r', '\f']) {
			expect(htmlFmt(`<p><em>x</em>${whitespace}y</p>`)).toBe('<p><em>x</em> y</p>')
		}
	})

	it('does not invent whitespace around inline void and phrasing elements', () => {
		expect(htmlFmt('<p>a<img src=x>b</p>')).toBe('<p>a<img src="x">b</p>')
		expect(htmlFmt('<p>a<input value=x>b</p>')).toBe('<p>a<input value="x">b</p>')
		expect(htmlFmt('<p>word<wbr>break</p>')).toBe('<p>word<wbr>break</p>')
		expect(htmlFmt('<p>a <img src=x> b</p>')).toBe('<p>a <img src="x"> b</p>')
		expect(htmlFmt('<p>a <input value=x> b</p>')).toBe('<p>a <input value="x"> b</p>')
		expect(htmlFmt('<p>word <wbr> break</p>')).toBe('<p>word <wbr> break</p>')
		expect(htmlFmt('<p>a<label>b</label>c</p>')).toBe('<p>a<label>b</label>c</p>')
		expect(htmlFmt('<p>a<button>b</button>c</p>')).toBe('<p>a<button>b</button>c</p>')
	})

	it('preserves source adjacency around custom elements', () => {
		expect(htmlFmt('<p>a<word-part>b</word-part>c</p>')).toBe(
			'<p>a<word-part>b</word-part>c</p>',
		)
	})

	it('does not add newline before inline element at start of block', () => {
		const result = htmlFmt('<p><strong>Bold</strong> start.</p>')
		expect(result).not.toContain('\n  <strong>')
		expect(result).toContain('<p><strong>Bold</strong>')
	})

	it('handles nested inline elements', () => {
		const result = htmlFmt('<p>Text with <strong>bold and <em>italic</em></strong> end.</p>')
		expect(result).toContain('<strong>bold and <em>italic</em></strong>')
		expect(result).toContain('</strong> end.')
	})

	it('inline elements do not increase indentation depth', () => {
		const result = htmlFmt('<div><p>Text <span>inline</span> more.</p></div>')
		// <p> is at depth 1, content at same depth — no extra indent from <span>
		expect(result).toBe('<div>\n  <p>Text <span>inline</span> more.</p>\n</div>')
	})

	it('preserves single space between adjacent inline elements', () => {
		// Whitespace-only content between </em> and <strong> must render as space
		const result = htmlFmt('<p><em>italic</em> <strong>bold</strong></p>')
		expect(result).toContain('</em> <strong>')
	})

	it('closes inline element on same line as wrapped content (no orphaned closing tag)', () => {
		// When inline element content exceeds lineWrap, the closing tag must stay
		// on the same line as the last content line — not end up on its own unindented line
		const longText = 'Dies ist ein sehr langer Text der die Zeilenbreite überschreitet und umgebrochen wird.'
		const input = `<div><p><em>${longText}</em></p></div>`
		const result = htmlFmt(input, { lineWrap: 60 })
		expect(result).not.toMatch(/\n<\/em>/)
		expect(result).toContain('</em>')
	})

})

describe('htmlFmt — svg preservation', () => {

	it('preserves inline SVG content verbatim', () => {
		// Note: pre-processing normalises `/>` → ` />` globally (harmless for SVG)
		const input = '<div><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 0L24 24H0Z" /></svg></div>'
		const result = htmlFmt(input)
		expect(result).toContain('<path d="M12 0L24 24H0Z" />')
	})

	it('does not reformat inner SVG tags', () => {
		const input = '<div><svg><circle cx="12" cy="12" r="5" /><path d="M0 0" /></svg></div>'
		const result = htmlFmt(input)
		expect(result).toContain('<circle cx="12" cy="12" r="5" /><path d="M0 0" />')
	})

	it('indents svg opening tag at block level', () => {
		const result = htmlFmt('<div><svg><path /></svg></div>')
		expect(result).toContain('  <svg>')
	})

	it('does not increment indentation inside svg', () => {
		const result = htmlFmt('<div><svg><path /></svg><p>after</p></div>')
		// <p> should be at depth 1 (2 spaces), not depth 2 (4 spaces)
		expect(result).toContain('  <p>after</p>')
	})

	it('preserves multiline svg content exactly', () => {
		// Use already-normalised self-closing syntax (pre-processing: `/>` → ` />`)
		const svgContent = '\n  <path d="M0 0" />\n  <circle r="5" />\n'
		const input = `<div><svg>${svgContent}</svg></div>`
		const result = htmlFmt(input)
		expect(result).toContain(svgContent)
	})

	it('preserves <svg class="..."> content', () => {
		const input = '<div><svg class="icon" aria-hidden="true"><use href="#icon-check" /></svg></div>'
		const result = htmlFmt(input)
		expect(result).toContain('<use href="#icon-check" />')
	})

})

describe('htmlFmt — blank line fixes', () => {

	it('does not add a blank line after <script type="..."> when content follows immediately', () => {
		// Template emits <script type="...">\n{...} — the leading \n must not become a blank line
		const input = '<head><script type="application/ld+json">\n{"@context":"https://schema.org"}\n</script></head>'
		const result = htmlFmt(input)
		expect(result).not.toMatch(/<script[^>]*>\n\n/)
		expect(result).toContain('<script type="application/ld+json">\n')
		expect(result).toContain('{"@context"')
	})

	it('does not add a blank line before <hr> after a paragraph', () => {
		const result = htmlFmt('<div><p>text</p><hr></div>')
		expect(result).not.toMatch(/\n\n\s*<hr/)
		expect(result).toContain('</p>\n  <hr>')
	})

	it('does not add a blank line before <img> after a paragraph', () => {
		const result = htmlFmt('<div><p>text</p><img src="x.png" alt="x"></div>')
		expect(result).not.toMatch(/\n\n\s*<img/)
		expect(result).toContain('</p>\n  <img')
	})

	it('puts a block element on its own line even when text content precedes it', () => {
		// Previously the indentation of <ol> was appended with pad() spaces directly to the text:
		// "Punkt A            <ol>" — now the <ol> starts on its own line
		const result = htmlFmt('<li>Punkt A<ol><li>Sub</li></ol></li>')
		expect(result).not.toMatch(/Punkt A {2,}<ol/)
		expect(result).toContain('Punkt A\n')
		expect(result).toContain('\n  <ol>')
	})

	it('collapses multiple spaces in text content', () => {
		const result = htmlFmt('<p>richtig.  Das Werkzeug.</p>')
		expect(result).toContain('richtig. Das Werkzeug.')
		expect(result).not.toContain('richtig.  Das')
	})

	it('does not collapse spaces inside <pre>', () => {
		const result = htmlFmt('<pre>a  b  c</pre>')
		expect(result).toContain('a  b  c')
	})

})

describe('htmlFmt — normalization', () => {

	it('removes trailing slash from void elements', () => {
		expect(htmlFmt('<meta charset="utf-8" />')).toContain('<meta charset="utf-8">')
		expect(htmlFmt('<link rel="stylesheet" href="a.css" />')).toContain('<link rel="stylesheet" href="a.css">')
		expect(htmlFmt('<hr />')).toContain('<hr>')
		expect(htmlFmt('<source src="a.mp4" type="video/mp4" />')).toContain('<source src="a.mp4" type="video/mp4">')
	})

	it('preserves self-closing syntax on non-void elements', () => {
		// <path> is not a void element — slash must remain (e.g. standalone SVG-like usage)
		expect(htmlFmt('<div><path d="M0 0" /></div>')).toContain('<path d="M0 0" />')
	})

	it('quotes unquoted attribute values', () => {
		expect(htmlFmt('<meta charset=utf-8>')).toContain('charset="utf-8"')
		expect(htmlFmt('<img src=x.png alt=photo>')).toContain('src="x.png"')
		expect(htmlFmt('<img src=x.png alt=photo>')).toContain('alt="photo"')
		expect(htmlFmt('<input maxlength=100>')).toContain('maxlength="100"')
	})

	it('normalizes single-quoted attribute values to double quotes', () => {
		expect(htmlFmt("<input type='text'>")).toContain('type="text"')
		expect(htmlFmt("<a href='/page/' class='nav'>link</a>")).toContain('href="/page/"')
		expect(htmlFmt("<a href='/page/' class='nav'>link</a>")).toContain('class="nav"')
	})

	it('leaves boolean attributes without values untouched', () => {
		expect(htmlFmt('<input type="checkbox" disabled>')).toContain('disabled>')
		expect(htmlFmt('<input type="checkbox" checked>')).toContain('checked>')
	})

	it('leaves already double-quoted attributes untouched', () => {
		const result = htmlFmt('<div class="foo" id="bar">text</div>')
		expect(result).toContain('class="foo"')
		expect(result).toContain('id="bar"')
	})

	it('lowercases tag names', () => {
		expect(htmlFmt('<DIV><P>text</P></DIV>')).toContain('<div>')
		expect(htmlFmt('<DIV><P>text</P></DIV>')).toContain('<p>text</p>')
		expect(htmlFmt('<DIV><P>text</P></DIV>')).toContain('</div>')
		expect(htmlFmt('<BR />')).toContain('<br>')
	})

	it('does not lowercase SVG attribute names', () => {
		const result = htmlFmt('<div><svg viewBox="0 0 24 24"><path d="M0 0" /></svg></div>')
		expect(result).toContain('viewBox="0 0 24 24"')
	})

})

describe('htmlFmt — crash resistance', () => {

	// Real Markdown-generated HTML from hadley's own HMD extension test page —
	// exercises every block/inline extension quad has to survive in practice.
	const articlePath = join(import.meta.dir, 'fixtures/hmd-testseite.html')
	const articleHtml = readFileSync(articlePath, 'utf-8')

	it('does not crash on complex Markdown-generated HTML', () => {
		expect(() => htmlFmt(articleHtml)).not.toThrow()
	})

	it('produces non-empty output for real article HTML', () => {
		const result = htmlFmt(articleHtml)
		expect(result.length).toBeGreaterThan(articleHtml.length * 0.8)
		expect(result).toContain('<!doctype html>')
		expect(result).toContain('</html>')
	})

	it('is idempotent on real article HTML (formatting its own output changes nothing)', () => {
		const once = htmlFmt(articleHtml)
		const twice = htmlFmt(once)
		expect(twice).toBe(once)
	})

})

// ── Regression tests: pre-publish review (quote-aware / case-insensitive lexer rewrite) ──

describe('htmlFmt — quote-aware attribute parsing', () => {

	it('does not end a tag early on ">" inside a double-quoted attribute value', () => {
		const result = htmlFmt('<div title="a > b">x</div>')
		expect(result).toContain('<div title="a > b">')
		expect(result).toContain('</div>')
		expect(result).not.toContain('b">"')
	})

	it('does not end a tag early on ">" inside a single-quoted attribute value', () => {
		const result = htmlFmt("<div title='a > b'>x</div>")
		expect(result).toContain('title="a > b"')
	})

	it('escapes a double quote embedded in a single-quoted value when converting quotes', () => {
		const result = htmlFmt(`<div title='a"b'>x</div>`)
		expect(result).toContain('title="a&quot;b"')
	})

	it('preserves a single quote embedded in a double-quoted value unchanged', () => {
		const result = htmlFmt(`<div title="a'b">x</div>`)
		expect(result).toContain(`title="a'b"`)
	})

	it('preserves leading and trailing whitespace inside an attribute value', () => {
		const result = htmlFmt('<div title="  a  ">x</div>')
		expect(result).toContain('title="  a  "')
	})

	it('does not hang on a stray "/" inside a tag that is not the self-closing marker', () => {
		const result = htmlFmt('<div foo/bar>x</div>')
		expect(result).toContain('x')
	})

})

describe('htmlFmt — case-insensitive raw content', () => {

	it('treats uppercase SCRIPT as raw content (does not reformat JS)', () => {
		const result = htmlFmt('<SCRIPT>if (a < b) x++;</SCRIPT>')
		expect(result).toContain('if (a < b) x++;')
		expect(result).toContain('</script>')
	})

	it('treats mixed-case Script as raw content, including a template literal with "<div>"', () => {
		const result = htmlFmt('<Script>const x = `<div>`</Script>')
		expect(result).toContain('const x = `<div>`')
	})

	it('treats uppercase STYLE as raw content', () => {
		const result = htmlFmt('<STYLE>.a > .b { color: red; }</STYLE>')
		expect(result).toContain('.a > .b { color: red; }')
	})

	it('treats uppercase PRE as raw content', () => {
		const result = htmlFmt('<PRE>  keep   me  </PRE>')
		expect(result).toContain('  keep   me  ')
	})

	it('treats uppercase TEXTAREA as raw content', () => {
		const result = htmlFmt('<TEXTAREA>if (a < b) { <foo> }</TEXTAREA>')
		expect(result).toContain('if (a < b) { <foo> }')
	})

	it('treats <textarea> content as fully raw, including embedded tag-like fragments', () => {
		const result = htmlFmt('<textarea>if (a < b) { <foo> }</textarea>')
		expect(result).toContain('if (a < b) { <foo> }')
	})

	it('does not reformat tabs, "/>" or comment-like text inside raw content', () => {
		const result = htmlFmt('<script>\tconst re = /a\\/>/; // <!-- not a comment --></script>')
		expect(result).toContain('const re = /a\\/>/; // <!-- not a comment -->')
	})

})

describe('htmlFmt — style content preservation', () => {

	it('preserves a long CSS declaration on one line instead of word-wrapping it', () => {
		const css = '.foo { color: red; background: blue; font-size: 14px; margin: 0 auto; padding: 10px 20px 10px 20px; }'
		const result = htmlFmt(`<style>${css}</style>`)
		expect(result).toContain(css)
	})

})

describe('htmlFmt — stripComments whitespace handling', () => {

	it('inserts a separating space when stripping a comment between two words', () => {
		const result = htmlFmt('<p>a <!-- x --> b</p>', { stripComments: true })
		expect(result).toContain('a b')
		expect(result).not.toContain('ab')
	})

	it('does not insert a space when the comment had no surrounding whitespace in source', () => {
		const result = htmlFmt('<p>foo<!-- x -->bar</p>', { stripComments: true })
		expect(result).toContain('foobar')
	})

	it('does not insert a spurious space when stripping a comment directly between block tags', () => {
		const result = htmlFmt('<ul><li>a</li><!-- item --><li>b</li></ul>', { stripComments: true })
		expect(result).not.toContain('</li> <li>')
		expect(result).not.toContain('</li>\n \n')
	})

})

describe('htmlFmt — leading and trailing text', () => {

	it('preserves text-only input unchanged', () => {
		expect(htmlFmt('hello')).toBe('hello')
	})

	it('preserves text before the first tag', () => {
		const result = htmlFmt('before<div>x</div>')
		expect(result).toContain('before')
	})

	it('preserves text after the last tag', () => {
		const result = htmlFmt('<div>x</div>after')
		expect(result).toContain('after')
	})

})

describe('htmlFmt — doctype', () => {

	it('recognizes a lowercase doctype declaration as a tag, not text', () => {
		const result = htmlFmt('<!doctype html><html lang="en"><body>x</body></html>')
		expect(result).toContain('<!doctype html>')
		expect(result).toMatch(/<!doctype html>\n<html/)
	})

	it('recognizes an uppercase DOCTYPE declaration', () => {
		const result = htmlFmt('<!DOCTYPE html><html><body>x</body></html>')
		expect(result.toLowerCase()).toContain('<!doctype html>')
	})

})

describe('htmlFmt — malformed input does not hang or throw', () => {

	const withTimeout = (fn: () => void, ms: number) => {
		const start = performance.now()
		fn()
		expect(performance.now() - start).toBeLessThan(ms)
	}

	it('handles a tag missing its closing ">"', () => {
		withTimeout(() => expect(() => htmlFmt('<div class="x"')).not.toThrow(), 1000)
	})

	it('handles missing closing tags', () => {
		withTimeout(() => expect(() => htmlFmt('<div><p>text')).not.toThrow(), 1000)
	})

	it('handles an unterminated raw-content block', () => {
		withTimeout(() => expect(() => htmlFmt('<script>var x = 1;')).not.toThrow(), 1000)
	})

	it('handles an unterminated comment', () => {
		withTimeout(() => expect(() => htmlFmt('<!-- never closed')).not.toThrow(), 1000)
	})

	it('handles a stray "/" at an unexpected position in a tag', () => {
		withTimeout(() => expect(() => htmlFmt('<div foo/bar/baz>x</div>')).not.toThrow(), 1000)
	})

})

// ── Regression tests: pre-publish review round 2 (Codex) ──

describe('htmlFmt — namespaced tag names', () => {

	it('does not truncate a namespaced tag name at ":" and mistake it for a raw-content tag', () => {
		const result = htmlFmt('<svg:svg><rect/></svg:svg><p>after</p>')
		expect(result).toContain('<svg:svg>')
		expect(result).toContain('</svg:svg>')
		expect(result).toContain('<p>after</p>')
	})

	it('formats content after a namespaced tag normally instead of swallowing it as raw content', () => {
		const result = htmlFmt('<svg:svg><rect/></svg:svg><p>after</p>')
		// A truncated "svg" tag name would wrongly enter raw-content mode, search for a bare
		// </svg> closer, fail to find one, and consume the rest of the document verbatim.
		expect(result).not.toContain('<rect/></svg:svg><p>after</p>')
	})

})

describe('htmlFmt — whitespace before a whitespace-sensitive, non-inline opening tag', () => {

	it('preserves a source space before a custom element', () => {
		expect(htmlFmt('a <x-thing>b</x-thing>')).toBe('a <x-thing>b</x-thing>')
	})

	it('preserves a source space before <button>', () => {
		expect(htmlFmt('a <button>b</button>')).toBe('a <button>b</button>')
	})

	it('preserves a source space before <label>', () => {
		expect(htmlFmt('a <label>b</label>')).toBe('a <label>b</label>')
	})

	it('preserves a source space before <svg>', () => {
		expect(htmlFmt('a <svg></svg>')).toBe('a <svg></svg>')
	})

	it('does not invent a space when the source has none', () => {
		expect(htmlFmt('a<button>b</button>')).toBe('a<button>b</button>')
	})

	it('does not invent a space for layout-only whitespace right after a block tag opens', () => {
		const result = htmlFmt('<div> <button>x</button></div>')
		expect(result).not.toContain('> <button')
	})

})

describe('htmlFmt — unencoded "<" in prose does not corrupt the rest of the document', () => {

	it('leaves a bare "a < b" comparison as literal text', () => {
		expect(htmlFmt('<p>a < b</p><p>after</p>')).toBe('<p>a < b</p>\n<p>after</p>')
	})

	it('does not swallow content up to an unrelated later ">"', () => {
		const result = htmlFmt('<button id="test">test < test</button>')
		expect(result).toBe('<button id="test">test < test</button>')
	})

	it('does not corrupt indentation of subsequent siblings', () => {
		const result = htmlFmt('<p>Wert < 5 und < weiter Text</p><p>after</p>')
		expect(result).toBe('<p>Wert < 5 und < weiter Text</p>\n<p>after</p>')
	})

	it('still normalizes a genuine "< div>" template whitespace artifact', () => {
		expect(htmlFmt('< div>x</div >')).toBe('<div>x</div>')
	})

	it('still normalizes a genuine "</ div>" closing-tag whitespace artifact', () => {
		expect(htmlFmt('<div>x</ div>')).toBe('<div>x</div>')
	})

	it('does not treat "<" inside a quoted attribute value as a stray tag start', () => {
		expect(htmlFmt('<div title="a < b">x</div>')).toBe('<div title="a < b">x</div>')
	})

})
