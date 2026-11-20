// What the tests and the oracle read instead of keeping lists of their own

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import htmlFmt from '../index.ts'

const root = join(import.meta.dir, '..')

// Every HTML element name TypeScript's copy of the DOM standard knows, current and deprecated
export const htmlElementNames = (): string[] => {
	const source = readFileSync(join(root, 'node_modules/typescript/lib/lib.dom.d.ts'), 'utf-8')
	const names: string[] = []
	for (const map of ['HTMLElementTagNameMap', 'HTMLElementDeprecatedTagNameMap']) {
		const body = new RegExp('interface ' + map + ' \\{([^}]*)\\}').exec(source)
		if (body === null) throw new Error(`lib.dom.d.ts of TypeScript has no interface ${map}`)
		for (const entry of body[1]!.matchAll(/"([a-z0-9]+)":/g)) names.push(entry[1]!)
	}
	if (names.length < 100) throw new Error(`only ${names.length} element names read from lib.dom.d.ts`)
	return names
}

// A block tag breaks after preceding text. Head/body cannot follow text under the boundary guard, so probe
// their content with a margin too small to fit instead. Neither probe duplicates the element table.
export const isBlockForQuad = (name: string): boolean =>
	name === 'head' || name === 'body'
		? htmlFmt(`<${name}>x</${name}>`, { lineWrap: 1 }).includes('\n')
		: htmlFmt(`a<${name}>b`).includes('\n')

// The names in the row `category` of the README's table of elements, "h1–h6" spelled out
export const namesInReadme = (category: string): string[] => {
	const row = readFileSync(join(root, 'README.md'), 'utf-8').split('\n').find(line => line.startsWith(`| ${category} |`))
	if (row === undefined) throw new Error(`the README has no row ${category} in its table of elements`)
	const cell = row.split('|')[category.includes('`') ? 1 : 2]!
	return cell.replace(/`/g, '').replace('h1–h6', 'h1 h2 h3 h4 h5 h6').split(/[\s,]+/).filter(name => /^[a-z][a-z0-9]*$/.test(name))
}
