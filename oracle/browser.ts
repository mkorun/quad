// Drives the browser of the oracle without a package: Bun serves the harness page and the documents on
// 127.0.0.1, one headless Chromium loads them all and posts the results back.

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// The one place that names the browser
const CHROMIUM_VARIABLE = 'QUAD_CHROMIUM'
const chromium = process.env[CHROMIUM_VARIABLE] ?? 'chromium'

const TIMEOUT_MS = 180_000

const ONE_PIXEL_GIF = Uint8Array.from(atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'), character => character.charCodeAt(0))

export interface BrowserDocument {
	// The DOM in the normal form N, with the comments and with the comments outside verbatim content taken out
	normalForm: string
	normalFormWithoutComments: string
	// The text of each comment outside verbatim content: the ones stripComments removes, bar its exceptions
	comments: string[]
	// document.body.innerText, with the comments and with the comments outside verbatim content taken out
	text: string
	textWithoutComments: string
}

export interface BrowserResult {
	documents: BrowserDocument[]
	// For each element name asked for, the `display` of the default stylesheet, and how the harness reads it: the
	// box sits in a line of text, is a block, or is none
	displays: Record<string, { display: string, box: 'inline' | 'block' | 'hidden' }>
}

const browserError = (reason: string): Error =>
	new Error(`The oracle's browser "${chromium}" ${reason}. Set ${CHROMIUM_VARIABLE} to a Chromium binary.`)

// Loads every document in the browser and returns what it made of each, and the display of each element name
export const runInBrowser = async (documents: string[], elementNames: string[]): Promise<BrowserResult> => {
	let deliver: (body: string) => void = () => {}
	const delivered = new Promise<string>(resolve => { deliver = resolve })
	const harness = Bun.file(join(import.meta.dir, 'harness.html'))
	const server = Bun.serve({
		hostname: '127.0.0.1',
		port: 0,
		async fetch(request) {
			const path = new URL(request.url).pathname
			if (path === '/') return new Response(harness, { headers: { 'content-type': 'text/html; charset=utf-8' } })
			if (path === '/job') return Response.json({ documents: documents.length, elementNames })
			if (path === '/result' && request.method === 'POST') {
				deliver(await request.text())
				return new Response('')
			}
			const document = /^\/document\/(\d+)$/.exec(path)
			if (document !== null && Number(document[1]) < documents.length) {
				return new Response(documents[Number(document[1])], { headers: { 'content-type': 'text/html; charset=utf-8' } })
			}
			// What a document links to. An image that fails to load is replaced by its alternative text at a moment
			// of the browser's choosing, which made the rendered text differ from run to run: every image loads.
			if (path.endsWith('.css')) return new Response('', { headers: { 'content-type': 'text/css' } })
			return new Response(ONE_PIXEL_GIF, { headers: { 'content-type': 'image/gif' } })
		},
	})
	const profile = mkdtempSync(join(tmpdir(), 'quad-oracle-'))
	let browser: Bun.Subprocess<'ignore', 'ignore', 'pipe'> | null = null
	let timer: ReturnType<typeof setTimeout> | undefined
	try {
		try {
			browser = Bun.spawn(
				// --disable-breakpad: without it helper processes outlive the browser
				[chromium, '--headless', '--no-sandbox', '--disable-gpu', '--disable-breakpad', '--user-data-dir=' + profile, `http://127.0.0.1:${server.port}/`],
				{ stdin: 'ignore', stdout: 'ignore', stderr: 'pipe' },
			)
		} catch (error) {
			throw browserError('cannot start: ' + String(error))
		}
		const started = browser
		const exited = started.exited.then(async code => {
			const errors = (await new Response(started.stderr).text()).trim().split('\n').slice(-3).join(' | ')
			throw browserError(`ended with code ${code} before it gave a result: ${errors}`)
		})
		const timedOut = new Promise<never>((_, reject) => {
			timer = setTimeout(() => reject(browserError(`gave no result within ${TIMEOUT_MS / 1000} s`)), TIMEOUT_MS)
		})
		const result = JSON.parse(await Promise.race([delivered, exited, timedOut])) as BrowserResult & { error?: string }
		if (result.error !== undefined) throw new Error('The harness page failed: ' + result.error)
		return result
	} finally {
		clearTimeout(timer)
		if (browser !== null) {
			browser.kill()
			await browser.exited.catch(() => {})
		}
		await server.stop(true)
		rmSync(profile, { recursive: true, force: true })
	}
}
