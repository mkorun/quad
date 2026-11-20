// The oracle's own tests (fuzzer contract, point 7): pairs of an input and what quad 0.1.5 wrote for it, whose
// verdict is known apart from the oracle. The outputs of 0.1.5 are in outputs-0.1.5.json, written by record.ts.

import type { HtmlFmtOptions } from '../index.ts'

export interface OracleCase {
	// Starts with the finding it belongs to
	id: string
	input: string
	options: HtmlFmtOptions
	// With stripComments: the text of each comment outside verbatim content that the output must still have, in
	// order. Without this, none: every such comment of the input is one that stripComments removes.
	keeps?: string[]
}

// Reported as faults of 0.1.5 by the fuzzer of 2026-11-17; a browser builds the same DOM and renders the same
// text for input and output, so the oracle must let them pass
export const falseAlarms: OracleCase[] = [
	{ id: 'false alarm: "/>" on <style>', input: '<style <br/>.', options: {} },
	{ id: 'false alarm: "/ >" on <svg>', input: '<svg/ ></svg>', options: {} },
	{ id: 'false alarm: whitespace on both sides of <!-->', input: '<p>baaaaa<!--> aaa', options: { lineWrap: 20 } },
]

// The findings a browser can see. What 0.1.5 wrote for each must fail; what quad writes now must pass.
export const findings: OracleCase[] = [
	{ id: 'Q-1 <title>', input: '<title><T></title>', options: {} },
	{ id: 'Q-2 <label>', input: `<p><label>${'a'.repeat(100)}</label>x</p>`, options: {} },
	{ id: 'Q-2 <button>', input: '<p><button>aaaaa</button>x</p>', options: { lineWrap: 20 } },
	{ id: 'Q-2 custom element', input: '<y><p><my-el>aaaaa</my-el>', options: { lineWrap: 40, indentation: '    ' } },
	{ id: 'Q-3 nested <svg>', input: '<svg><svg></svg><text xml:space="preserve">A  B</text></svg>', options: {} },
	{ id: 'Q-4 <!-->', input: '<p>a<!-->b</p>', options: { stripComments: true } },
	{ id: 'Q-5 <pre>', input: '<pre>', options: {} },
	{ id: 'Q-5 <textarea>', input: '<textarea>', options: {} },
	{ id: 'Q-5 <script>', input: '<script a=><a', options: {} },
	{ id: 'Q-6 "<" in <style>', input: '<style <d>', options: {} },
	{ id: 'Q-6 "<" in <a>', input: '<a <n>', options: {} },
	{ id: 'Q-6 no-break space in <script>', input: '<script\u00a0>', options: {} },
	{ id: 'Q-6 no-break space in <a>', input: '<a\u00a0>', options: {} },
	{ id: 'Q-6 "=" as attribute name', input: '<a =>', options: {} },
	{ id: 'Q-6 "/" in a tag', input: '<a/a> a', options: {} },
	{ id: 'Q-6 quote outside a value', input: '<a">a >', options: {} },
	{ id: 'Q-6 bogus comment "<!"', input: '<a><! ', options: {} },
	{ id: 'Q-6 bogus comment "<?"', input: '<a><? ', options: {} },
	{ id: 'Q-6 bogus comment "</"', input: '<a></ ', options: {} },
	{ id: 'Q-6 <script/>', input: '<script/><R', options: {} },
	{ id: 'N-1 line break in a value', input: '<a title="line1\nline2\tx">', options: {} },
	{ id: 'N-2 "/" ends a value', input: '<a href=x/>', options: {} },
	{ id: 'N-3 nested <pre>', input: '<pre>a<pre>b</pre> c  d</pre>', options: {} },
	{ id: 'N-4 <script> in text', input: '<p>a<script>x</script>b</p>', options: {} },
	{ id: 'N-4 <style> in text', input: '<p><span>a</span><style>.x{}</style>b</p>', options: {} },
	{ id: 'N-5 <picture>', input: '<p>x<picture><source><img></picture>y</p>', options: {} },
	{ id: 'N-5 <math>', input: '<p>a<math><mi> x </mi></math>b</p>', options: {} },
	{ id: 'N-6 JSON in <script>', input: '<script type="application/json">{"a":1}</script>', options: {} },
	{ id: 'N-7 comment after "<"', input: '<p>a<<!--c-->/p>b', options: { stripComments: true }, keeps: ['c'] },
	{ id: 'N-7 comment in a character reference', input: '<p>&am<!--c-->p;</p>', options: { stripComments: true }, keeps: ['c'] },
	{ id: 'N-8 whitespace-only content', input: '<div> </div>', options: {} },
	{ id: 'N-9 form feed', input: '<p><em>x</em>\fy</p>', options: {} },
	{ id: 'N-10 <wbr>', input: '<p>a<wbr> b c d e f g h i j k</p>', options: { lineWrap: 20 } },
	{ id: 'N-11 non-ASCII tag name', input: '<x-É>', options: {} },
]

// The findings of the review of the rewrite (2026-11-19, R-1 to R-10 in tests/findings.test.ts) that a browser can
// see. `before` is what the rewrite wrote as it was reviewed (88ef33e): that must fail; what quad writes now must pass.
export const reviewFindings: (OracleCase & { before: string })[] = [
	{ id: 'R-1 doctype next to a comment in an empty element', input: '<div><!--><!doctype html></div>', before: '<div><!--> <!doctype html></div>', options: {} },
	{
		id: 'R-3 </pre> in an integration point of <math> inside <pre>', options: {},
		input: '<pre><math><mi>a</pre>b</mi></math></pre>',
		before: '<pre><math><mi>a</pre>\nb</mi></math>\n</pre>',
	},
	{
		id: 'R-3 </pre> in a CDATA section of <svg> inside <pre>', options: {},
		input: '<pre><svg><![CDATA[ a > b </pre> ]]></svg>  c  d</pre>',
		before: '<pre><svg><![CDATA[ a > b </pre>\n]]></svg> c d\n</pre>',
	},
	{
		id: 'R-4 </svg> in a <textarea> inside <foreignObject>', options: {},
		input: '<svg><foreignObject><textarea></svg><DIV>a</DIV></textarea></foreignObject></svg>',
		before: '<svg><foreignObject><textarea></svg>\n<div>a</div>\n</textarea></foreignobject></svg>',
	},
	{
		id: 'R-4 </math> in a <textarea> inside <annotation-xml>', options: {},
		input: '<math><annotation-xml encoding="text/html"><textarea></math><DIV>a</DIV></textarea></annotation-xml></math>',
		before: '<math><annotation-xml encoding="text/html"><textarea></math>\n<div>a</div>\n</textarea></annotation-xml></math>',
	},
	{
		id: 'R-4 </math> in an <xmp> inside the <foreignObject> of an <svg> in <annotation-xml>', options: {},
		input: '<math><annotation-xml encoding="image/svg+xml"><svg><foreignObject><xmp></math>  </svg></xmp></foreignObject></svg></annotation-xml></math>',
		before: '<math><annotation-xml encoding="image/svg+xml"><svg><foreignObject><xmp></math> </svg>\n</xmp>\n</foreignobject></svg></annotation-xml></math>',
	},
	{ id: 'last review: wrap after &#8203;', options: { lineWrap: 20 }, input: '<p>aaaaaaaaaaaaaaaaaaaa&#8203; b</p>', before: '<p>\n  aaaaaaaaaaaaaaaaaaaa&#8203;\n  b\n</p>' },
	{ id: 'last review: wrap after &#x200B;', options: { lineWrap: 20 }, input: '<p>aaaaaaaaaaaaaaaaaaaa&#x200B; b</p>', before: '<p>\n  aaaaaaaaaaaaaaaaaaaa&#x200B;\n  b\n</p>' },
	{ id: 'last review: wrap after &ZeroWidthSpace;', options: { lineWrap: 20 }, input: '<p>aaaaaaaaaaaaaaaaaaaa&ZeroWidthSpace; b</p>', before: '<p>\n  aaaaaaaaaaaaaaaaaaaa&ZeroWidthSpace;\n  b\n</p>' },
	{ id: 'last review: wrap before encoded U+200B across a tag', options: { lineWrap: 20 }, input: '<p>aaaaaaaaaaaaaaaaaaaa <span>&#8203;b</span></p>', before: '<p>\n  aaaaaaaaaaaaaaaaaaaa\n  <span>&#8203;b</span>\n</p>' },
	{
		id: 'last review: over-long region changes script', options: {},
		input: '<pre><svg></pre><script>const x = "</svg></pre><P>A  B</P>";</script>',
		before: '<pre><svg></pre><script>const x = "</svg></pre>\n<p>A B</p>\n";</script>',
	},
	{
		id: 'last review: over-long region changes text', options: {},
		input: '<pre><svg></pre>a</svg></pre>b',
		before: '<pre><svg></pre>a</svg></pre>\nb',
	},
	{
		id: 'last review: R-8 text after body', options: {},
		input: '<html><head></head><body>a</body>x</html>',
		before: '<html>\n\n<head></head>\n\n<body>a</body>\n\nx\n</html>',
	},
	{
		id: 'last review: R-8 late body', options: {},
		input: '<html><head></head>x<body>a</body></html>',
		before: '<html>\n\n<head></head>\n\nx\n<body>a</body>\n\n</html>',
	},
	{
		id: 'last review: R-8 late head', options: {},
		input: '<body>a<head></head>b</body>',
		before: '<body>\n  a\n  <head></head>\n\n  b\n</body>',
	},
]

// The findings of that review about the oracle itself: a fault quad does not make, written by hand, in which the
// oracle as reviewed (88ef33e) saw no difference. Each `faulty` output must fail; what quad writes for the input
// must pass.
export const blindSpots: (OracleCase & { faulty: string })[] = [
	// R-5: in the content of a <template> every element counted as a block, so whitespace next to an inline one was free
	{
		id: 'R-5 whitespace added around an inline element in <template>', options: {},
		input: '<template><p>a<span>b</span>c</p></template>', faulty: '<template><p>a <span>b</span> c</p></template>',
	},
	{
		id: 'R-5 whitespace removed in an inline element in <template>', options: {},
		input: '<template><div>a<em> b </em>c</div><div hidden> d </div></template>',
		faulty: '<template><div>a<em>b</em>c</div><div hidden> d </div></template>',
	},
	// R-6: with stripComments the comments outside verbatim content were left out of both sides, so the oracle saw
	// neither one that stayed nor one that went without cause
	{
		id: 'R-6 a comment that stripComments left in place', options: { stripComments: true },
		input: '<p>a<!--c-->b</p><!-- d -->', faulty: '<p>ab</p>\n<!-- d -->',
	},
	{
		id: 'R-6 a comment the browser makes of "<!…>", removed', options: { stripComments: true }, keeps: ['x', ' y'],
		input: '<p>a<!x>b</ y></p>', faulty: '<p>ab</ y></p>',
	},
	// This one the reviewed oracle saw; it stays as the other half of R-6: a comment in verbatim content is kept
	{
		id: 'R-6 a comment in <svg>, removed', options: { stripComments: true },
		input: '<p>a<svg><!--c--></svg>b</p>', faulty: '<p>a<svg></svg>b</p>',
	},
	// Found with the check of R-6: of "<?x …>" Chromium 156 makes a processing instruction, not a comment, and the
	// normal form left that node out
	{ id: 'R-6 the node the browser makes of "<?x …>", removed', options: {}, input: '<p>a<?x y?>b</p>', faulty: '<p>ab</p>' },
	{
		id: 'last review: processing instruction removed with stripComments', options: { stripComments: true },
		input: '<p>a<?x y?>b</p>', faulty: '<p>ab</p>',
	},
]

// Every one of the findings of 0.1.5 has at least one case above. Q-7, Q-8, N-12 and N-13 are about formatting twice and about
// growth; no browser is needed to see them (tests/findings.test.ts).
export const findingsInTheBrowser = [
	'Q-1', 'Q-2', 'Q-3', 'Q-4', 'Q-5', 'Q-6', 'N-1', 'N-2', 'N-3', 'N-4', 'N-5', 'N-6', 'N-7', 'N-8', 'N-9', 'N-10', 'N-11',
]

// Where a browser sees a difference in what quad writes today, each a limit README "Known limitations" names:
// quad knows an element by its name and a tag by its spelling, not the tree a browser builds. The oracle must
// keep seeing them; the generator of tests/generator.ts leaves these constructs out of D1.
export const knownDifferences: OracleCase[] = [
	// A start tag ends the element before it; quad opens a new level and the first element is no longer empty
	{ id: 'known: empty element ended by the next start tag', input: '<ul><li><li>b</li></ul>', options: {} },
	// For a browser whitespace after </body> is content of <body>
	{ id: 'known: empty <body> before </html>', input: '<html><head></head><body></body></html>', options: {} },
	// The default stylesheet hides an element with the attribute `hidden`, one with the attribute `popover` until
	// it is opened, and a <dialog> without `open`; quad still puts their tags on lines of their own, and between
	// text that whitespace renders
	{ id: 'known: block element with the attribute hidden', input: '<p>a</p>b<div hidden>x</div>c', options: {} },
	{ id: 'known: block element with the attribute popover', input: '<p>a</p>b<div popover>x</div>c', options: {} },
	{ id: 'known: <dialog> that is not open', input: '<p>a</p>b<dialog>x</dialog>c', options: {} },
	// The end of the input is free (W1), also inside an inline element that no end tag closed. Nothing renders
	// differently; the text of that element loses its last whitespace.
	{ id: 'known: whitespace at the end of the input in an open inline element', input: '<p>a</p><span>b ', options: {} },
]

// The list test: quad's block elements that the default stylesheet does not show at all, with no attribute set.
// Every other block of quad must be a block for the browser.
//   dialog  shown with `open`; without it the first of the known differences above
//   head    never shown, and all around it is free: only <html> and <body> stand next to it
export const blocksNotShown = ['dialog', 'head']
