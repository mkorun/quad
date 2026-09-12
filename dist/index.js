const htmlVoidElements = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
// Inline elements — do not create an indentation level, no newline before/after
const htmlInlineElements = new Set(['a', 'abbr', 'b', 'bdi', 'bdo', 'cite', 'code', 'data', 'del', 'dfn', 'em', 'i', 'ins', 'kbd', 'mark', 'q', 'rb', 'rp', 'rt', 'rtc', 'ruby', 's', 'samp', 'small', 'span', 'strong', 'sub', 'sup', 'time', 'u', 'var']);
// Elements whose surrounding source whitespace can affect rendered inline flow. This is wider
// than htmlInlineElements: it includes phrasing/replaced/void elements that quad may still choose
// to format as blocks, but must never separate from adjacent text by inventing whitespace.
const htmlWhitespaceSensitiveElements = new Set([
    'a', 'abbr', 'audio', 'b', 'bdi', 'bdo', 'br', 'button', 'canvas', 'cite', 'code', 'data', 'datalist',
    'del', 'dfn', 'em', 'embed', 'i', 'iframe', 'img', 'input', 'ins', 'kbd', 'label', 'map', 'mark', 'meter',
    'noscript', 'object', 'output', 'picture', 'progress', 'q', 'rb', 'rp', 'rt', 'rtc', 'ruby', 's', 'samp',
    'select', 'slot', 'small', 'span', 'strong', 'sub', 'sup', 'svg', 'textarea', 'time', 'u', 'var', 'video', 'wbr',
]);
// Autonomous custom elements have inline behavior unless styled otherwise. More importantly,
// preserving source adjacency is always safer than inserting a new whitespace text node.
const isWhitespaceSensitiveTag = (tagName) => htmlWhitespaceSensitiveElements.has(tagName) || tagName.indexOf('-') > 0;
// Elements whose content is scanned verbatim by the lexer — no tag tokenizing inside
const rawContentTags = new Set(['script', 'style', 'pre', 'textarea', 'svg']);
// charCode-based character classification — avoids per-character regex .test() overhead
// in the hot scanning loop below (measured ~40% of tokenizer time before this change).
const isWsCode = (code) => code === 32 || code === 9 || code === 10 || code === 13;
const isTrailingWsCode = (code) => isWsCode(code) || code === 11 || code === 12 || code === 160 || code === 5760 ||
    (code >= 8192 && code <= 8202) || code === 8232 || code === 8233 || code === 8239 ||
    code === 8287 || code === 12288 || code === 65279;
const isLetterCode = (code) => (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
// ':' (58) is included for namespaced tags (e.g. inline SVG's <svg:svg>) — excluding it truncated
// the scanned name to "svg", which wrongly matched rawContentTags and mis-detected the raw-content
// closing tag (looking for </svg> instead of the real </svg:svg>).
const isTagNameCode = (code) => isLetterCode(code) || (code >= 48 && code <= 57) || code === 45 /* '-' */ || code === 58; /* ':' */
// HTML's own "ASCII whitespace" definition (WHATWG HTML spec) — deliberately narrower than
// JavaScript's String.prototype.trim(), which also strips NBSP (U+00A0) and other Unicode space
// separators. NBSP is a meaningful, visible character in HTML content (renders as a
// non-breaking space) — using JS's trim() on text nodes would silently delete it.
const isHtmlWsCode = (code) => code === 32 || code === 9 || code === 10 || code === 12 || code === 13;
// charCodeAt(length - 1) instead of .at(-1) — avoids .at()'s own bounds/negative-index handling
// on a call site that runs once per whitespace-sensitive opening tag.
const isTrailingSpaceOrNewline = (s) => {
    if (!s)
        return false;
    const c = s.charCodeAt(s.length - 1);
    return c === 32 || c === 10;
};
const htmlTrimStart = (s) => {
    let i = 0;
    while (i < s.length && isHtmlWsCode(s.charCodeAt(i)))
        i++;
    return i === 0 ? s : s.slice(i);
};
const htmlTrim = (s) => {
    let start = 0;
    let end = s.length;
    while (start < end && isHtmlWsCode(s.charCodeAt(start)))
        start++;
    while (end > start && isHtmlWsCode(s.charCodeAt(end - 1)))
        end--;
    return start === 0 && end === s.length ? s : s.slice(start, end);
};
// Whitespace fixups applied only to a single, already-bounded tag's text — safe because the
// lexer already resolved the tag's true (quote-aware) boundaries before this runs. The trailing
// scan deliberately walks across all whitespace before "/>" so "<br  />" becomes "<br />".
const cleanTagText = (text) => {
    const c1 = text.charCodeAt(1);
    const afterIdx = c1 === 47 /* '/' */ ? 2 : 1;
    const needsLeadingFix = isWsCode(text.charCodeAt(afterIdx));
    const needsTabFix = text.indexOf('\t') !== -1;
    let result = text;
    if (needsTabFix)
        result = result.replace(/\t/g, '  ');
    if (needsLeadingFix) {
        result = c1 === 47 ? result.replace(/^<\/\s+/, '</') : result.replace(/^<\s+/, '<');
    }
    const end = result.length - 1;
    if (end < 0 || result.charCodeAt(end) !== 62 /* '>' */)
        return result;
    let beforeEnd = end - 1;
    while (beforeEnd >= 0 && isTrailingWsCode(result.charCodeAt(beforeEnd)))
        beforeEnd--;
    if (result.charCodeAt(beforeEnd) === 47 /* '/' */) {
        let beforeSlash = beforeEnd - 1;
        while (beforeSlash >= 0 && isTrailingWsCode(result.charCodeAt(beforeSlash)))
            beforeSlash--;
        return result.slice(0, beforeSlash + 1) + ' />';
    }
    return beforeEnd === end - 1 ? result : result.slice(0, beforeEnd + 1) + '>';
};
// Single-pass lexer — replaces the old split-regex tokenization. Guarantees forward progress
// on every branch (no infinite loop), tracks quotes inside tags (`>` inside an attribute value
// does not end the tag), and matches raw-content tag names case-insensitively. Produces a flat
// list that strictly alternates TEXT, TAG-OR-COMMENT, TEXT, ... starting and ending with TEXT
// (possibly empty) — same shape the formatting loop below already expects.
const tokenize = (html) => {
    const parts = [];
    const len = html.length;
    let i = 0;
    let textStart = 0;
    while (i < len) {
        if (html.charCodeAt(i) !== 60 /* '<' */) {
            i++;
            continue;
        }
        // Comment — captured whole (open + content + close) as one token
        if (html.charCodeAt(i + 1) === 33 /* '!' */ && html.charCodeAt(i + 2) === 45 && html.charCodeAt(i + 3) === 45 /* "!--" */) {
            parts.push(html.slice(textStart, i).replace(/\t/g, '  '));
            const end = html.indexOf('-->', i + 4);
            const commentEnd = end === -1 ? len : end + 3;
            parts.push(html.slice(i, commentEnd));
            i = commentEnd;
            textStart = i;
            continue;
        }
        // Doctype declaration — "<!doctype ...>", case-insensitive, not a normal tag (starts
        // with '<!' followed by a non-letter, so the generic tag scan below would skip it)
        if (html.charCodeAt(i + 1) === 33 && html.slice(i, i + 9).toLowerCase() === '<!doctype') {
            parts.push(html.slice(textStart, i).replace(/\t/g, '  '));
            let j = i + 9;
            let inQuote = 0;
            while (j < len) {
                const c = html.charCodeAt(j);
                if (inQuote) {
                    if (c === inQuote)
                        inQuote = 0;
                    j++;
                    continue;
                }
                if (c === 34 || c === 39 /* '"' | "'" */) {
                    inQuote = c;
                    j++;
                    continue;
                }
                if (c === 62 /* '>' */) {
                    j++;
                    break;
                }
                j++;
            }
            parts.push(cleanTagText(html.slice(i, j)));
            i = j;
            textStart = i;
            continue;
        }
        // Tolerate whitespace after '<' or '</' before the real tag name ("< div>", "< /div>")
        let p = i + 1;
        while (p < len && isWsCode(html.charCodeAt(p)))
            p++;
        const isClosing = html.charCodeAt(p) === 47; /* '/' */
        if (isClosing) {
            p++;
            while (p < len && isWsCode(html.charCodeAt(p)))
                p++;
        }
        if (!isLetterCode(html.charCodeAt(p))) {
            // Not a real tag start (e.g. a bare '<' in text) — treat as literal, keep scanning
            i++;
            continue;
        }
        let j = p;
        while (j < len && isTagNameCode(html.charCodeAt(j)))
            j++;
        const tagName = html.slice(p, j).toLowerCase();
        // Scan to the real (unquoted) '>' — quotes inside the tag hide '>' from ending it. A
        // second, unquoted '<' before that '>' means this was never a real tag to begin with
        // (e.g. "a < b" in prose, matched here because whitespace-then-letter after the first
        // '<' looks like a tag start — see the tolerance above). A genuine tag's own markup
        // never contains a literal, unquoted '<' before its closing '>'; a real HTML tokenizer
        // doesn't speculatively commit past a second stray '<' either. Bailing out here (instead
        // of swallowing everything up to some unrelated later '>') is what keeps this from
        // corrupting the rest of the document.
        let inQuote = 0;
        let sawStrayLt = false;
        while (j < len) {
            const c = html.charCodeAt(j);
            if (inQuote) {
                if (c === inQuote)
                    inQuote = 0;
                j++;
                continue;
            }
            if (c === 34 || c === 39) {
                inQuote = c;
                j++;
                continue;
            }
            if (c === 60) {
                sawStrayLt = true;
                break;
            }
            if (c === 62) {
                j++;
                break;
            }
            j++;
        }
        if (sawStrayLt) {
            // Not a real tag after all — treat the original '<' as a literal character and
            // resume scanning right after it (the '<' just found becomes the next candidate).
            i++;
            continue;
        }
        parts.push(html.slice(textStart, i).replace(/\t/g, '  '));
        const tagText = cleanTagText(html.slice(i, j));
        parts.push(tagText);
        i = j;
        textStart = i;
        // Switch to raw-content mode for script/style/pre/textarea/svg (case-insensitive) —
        // copy everything verbatim up to the matching closing tag, no tag tokenizing inside.
        if (!isClosing && rawContentTags.has(tagName) && !tagText.endsWith('/>')) {
            const closeRe = new RegExp('</' + tagName + '\\s*>', 'i');
            const m = closeRe.exec(html.slice(i));
            if (m) {
                const contentEnd = i + m.index;
                parts.push(html.slice(i, contentEnd));
                parts.push(m[0]);
                i = i + m.index + m[0].length;
            }
            else {
                parts.push(html.slice(i));
                i = len;
            }
            textStart = i;
        }
    }
    parts.push(html.slice(textStart).replace(/\t/g, '  '));
    return parts;
};
// charCodeAt is a primitive-number comparison — faster than the equivalent single-character
// string comparisons (str[i] !== ' ') this replaces, same algorithm and output otherwise.
const CH_EQ = 61, CH_SP = 32, CH_GT = 62, CH_SLASH = 47, CH_DQ = 34, CH_SQ = 39;
// Returns [normalized tag text, lowercase tag name] — the tag name is already known internally
// (it's the first chunk built below) so the caller doesn't need a second regex pass to find it.
const normalizeTagAttrs = (str) => {
    let out = '';
    const len = str.length;
    let i = 0;
    while (i < len && str.charCodeAt(i) !== CH_SP && str.charCodeAt(i) !== CH_GT)
        i++;
    // Tag name starts at the first letter after '<' — skips a leading '!' for "<!doctype"
    let nameStart = 1;
    while (nameStart < i && !isLetterCode(str.charCodeAt(nameStart)))
        nameStart++;
    const tagName = str.slice(nameStart, i).toLowerCase();
    out += str.slice(0, nameStart).toLowerCase() + tagName;
    while (i < len) {
        const c = str.charCodeAt(i);
        if (c === CH_GT || (c === CH_SLASH && str.charCodeAt(i + 1) === CH_GT)) {
            out += str.slice(i);
            break;
        }
        if (c === CH_SP) {
            out += ' ';
            i++;
            while (i < len && str.charCodeAt(i) === CH_SP)
                i++;
            continue;
        }
        if (c === CH_SLASH) {
            // A '/' that isn't the self-closing marker (not followed by '>') — not valid here,
            // but must not stall the scan. Treat as a literal character and advance.
            out += '/';
            i++;
            continue;
        }
        let j = i;
        while (j < len) {
            const cc = str.charCodeAt(j);
            if (cc === CH_EQ || cc === CH_SP || cc === CH_GT || cc === CH_SLASH)
                break;
            j++;
        }
        out += str.slice(i, j);
        i = j;
        if (i >= len || str.charCodeAt(i) !== CH_EQ)
            continue;
        out += '=';
        i++;
        const q = str.charCodeAt(i);
        if (q === CH_DQ) {
            j = i + 1;
            while (j < len && str.charCodeAt(j) !== CH_DQ)
                j++;
            out += '"' + str.slice(i + 1, j) + '"';
            i = j + 1;
        }
        else if (q === CH_SQ) {
            j = i + 1;
            while (j < len && str.charCodeAt(j) !== CH_SQ)
                j++;
            out += '"' + str.slice(i + 1, j).replace(/"/g, '&quot;') + '"';
            i = j + 1;
        }
        else {
            j = i;
            while (j < len) {
                const cc = str.charCodeAt(j);
                if (cc === CH_SP || cc === CH_GT)
                    break;
                j++;
            }
            out += '"' + str.slice(i, j) + '"';
            i = j;
        }
    }
    return [out, tagName];
};
// Direct scan for a closing tag's name ("</name>", "</name >") — avoids a regex pass; closing
// tags never carry attributes so this is simpler than the opening-tag path above.
const closingTagName = (str) => {
    const len = str.length;
    let i = 2; // skip "</"
    while (i < len && str.charCodeAt(i) !== CH_SP && str.charCodeAt(i) !== CH_GT)
        i++;
    return str.slice(2, i).toLowerCase();
};
const multilines = (lines, paddingLeft, lineWrap) => {
    const result = [];
    let baseIndent = lineWrap;
    for (let line of lines) {
        if (htmlTrim(line)) {
            const lineIndent = line.length - htmlTrimStart(line).length;
            if (lineIndent > 0 && lineIndent < baseIndent) {
                baseIndent = lineIndent;
            }
        }
    }
    for (let line of lines) {
        if (baseIndent < lineWrap) {
            // Never strip more than this line's own leading whitespace — a line with less
            // indent than baseIndent must not lose content characters.
            const ownIndent = line.length - htmlTrimStart(line).length;
            line = line.substring(Math.min(baseIndent, ownIndent));
        }
        if (paddingLeft + line.length <= lineWrap) {
            result.push(line);
        }
        else {
            let newLine = [];
            let newLineLength = 0;
            const chunks = htmlTrim(line).split(/ /g);
            for (const chunk of chunks) {
                if (paddingLeft + newLineLength + chunk.length <= lineWrap) {
                    newLine.push(chunk);
                    newLineLength += chunk.length + 1;
                }
                else {
                    result.push(newLine.join(' '));
                    newLine = [chunk];
                    newLineLength = chunk.length + 1;
                }
            }
            result.push(newLine.join(' '));
        }
    }
    return result;
};
// How much of the *current visual line* a neighboring token occupies — used by the "does this
// fit on one line" check below. A neighboring token can itself be a wrapped multi-line tag (e.g.
// a long inline <a ...> with attributes split across lines); using its full string length there
// (including already-newline-separated earlier lines) overstates how much of the line is used,
// which can force an unnecessary extra wrap of short text that would actually fit fine right
// after the tag's last line.
const lastLineLength = (s) => {
    const i = s.lastIndexOf('\n');
    return i === -1 ? s.length : s.length - i - 1;
};
const firstLineLength = (s) => {
    const i = s.indexOf('\n');
    return i === -1 ? s.length : i;
};
const htmlFmt = (html, options = {}) => {
    if (html.length < 1) {
        return html;
    }
    const { indentation = '  ', lineWrap = 120, stripComments = false } = options;
    // Pad cache — indentation.repeat(n) allocates a new string every call; cache eliminates that
    const pads = [''];
    const pad = (n) => {
        while (pads.length <= n)
            pads.push(indentation.repeat(pads.length));
        return pads[n];
    };
    // Array accumulation — avoids repeated string copies on each +=
    const out = [];
    const parts = tokenize(html);
    let indentationCount = 0;
    let prevContent = '';
    let prevTag = '';
    let prevTagType = '';
    let prevIndentLength = 0;
    let singleLine = true;
    // Did the text immediately preceding the current position have trailing HTML whitespace in
    // the *source*, before trimming? An inline opening tag needs this to decide whether to
    // restore a separating space — guessing from the last emitted character is unreliable (it
    // can't tell "text ended with a space that got trimmed" from "text had no space at all").
    let prevTextTrailingWs = false;
    // Tracks the last rendering-relevant boundary across transparent comments. Unlike prevTag,
    // this is deliberately not changed by <!-- ... -->, because comments do not create visual
    // separation between adjacent text/phrasing content.
    let prevBoundarySensitive = false;
    for (let i = 0, ln = parts.length; i < ln; i++) {
        let str = parts[i];
        if (i % 2 != 0) {
            const isComment = str.startsWith('<!--');
            let tagName;
            let isClosing;
            if (isComment) {
                tagName = '--';
                isClosing = false;
            }
            else {
                const needsWsClean = str.includes('\n') || str.includes('\r') || str.includes('\t');
                const prepared = needsWsClean ? str.replace(/[\r\n\t]/g, ' ') : str;
                isClosing = prepared.at(1) === '/';
                if (isClosing) {
                    str = prepared.toLowerCase();
                    tagName = closingTagName(str);
                }
                else {
                    ;
                    [str, tagName] = normalizeTagAttrs(prepared);
                }
            }
            const isSelfClosing = !isComment && str.at(-2) === '/';
            const isInline = htmlInlineElements.has(tagName);
            const isWhitespaceSensitive = isWhitespaceSensitiveTag(tagName);
            const previousRaw = parts[i - 1] ?? '';
            const attachesToPrevious = isWhitespaceSensitive && ((previousRaw.length > 0 && !isHtmlWsCode(previousRaw.charCodeAt(previousRaw.length - 1))) ||
                (previousRaw === '' && prevBoundarySensitive));
            if (stripComments && isComment) {
                // Preserve a separating space when the comment sat between two touching words —
                // omitting it must not glue visible text together.
                const prevRaw = parts[i - 1] ?? '';
                const nextRaw = parts[i + 1] ?? '';
                const prevHadSpace = prevRaw.length > 0 && isHtmlWsCode(prevRaw.charCodeAt(prevRaw.length - 1));
                const nextHadSpace = nextRaw.length > 0 && isHtmlWsCode(nextRaw.charCodeAt(0));
                // If the following text already carries the separating whitespace, its normal
                // leading-boundary handling will restore it. Insert here only when the separation
                // existed exclusively before the removed comment, avoiding a doubled space.
                if (prevHadSpace && !nextHadSpace && out.length) {
                    const last = out[out.length - 1];
                    if (last && !/\s$/.test(last))
                        out.push(' ');
                }
                continue;
            }
            if (isClosing) {
                prevTagType = 'closing';
                // Inline elements, <html>, and raw-content blocks do not change indentation depth
                if (tagName !== 'html' && tagName !== 'svg' && !isInline) {
                    indentationCount = Math.max(0, indentationCount - 1);
                }
                const isRawBlock = rawContentTags.has(tagName);
                if (!prevContent) {
                    if (isRawBlock) {
                        // When the last pushed value is exactly '\n' (the post-open newline), no actual
                        // content followed — collapse to a single-line element instead of an empty block
                        const lastIdx = out.length - 1;
                        if (lastIdx >= 0 && out[lastIdx] === '\n') {
                            out[lastIdx] = str;
                        }
                        else {
                            out.push(str);
                        }
                    }
                    else if (isInline || prevTag === tagName) {
                        // Inline closing tag or empty element — keep on same line
                        const lastIdx = out.length - 1;
                        if (lastIdx >= 0 && out[lastIdx].endsWith('\n')) {
                            out[lastIdx] = out[lastIdx].slice(0, -1);
                        }
                        out.push(str);
                    }
                    else {
                        out.push('\n' + pad(indentationCount) + str);
                    }
                }
                else {
                    if (prevTag === 'br' || prevTag === 'hr') {
                        out.push('\n' + pad(indentationCount) + str);
                    }
                    else if (tagName === 'script' || tagName === 'style') {
                        out.push('\n' + pad(indentationCount) + str);
                    }
                    else if (singleLine || isInline) {
                        if (isInline && !singleLine) {
                            // Inline element with wrapped content — strip trailing newline
                            // so closing tag stays on the same line as the last content
                            const lastIdx = out.length - 1;
                            if (lastIdx >= 0 && out[lastIdx].endsWith('\n')) {
                                out[lastIdx] = out[lastIdx].slice(0, -1);
                            }
                        }
                        out.push(str);
                    }
                    else {
                        out.push(pad(indentationCount) + str);
                    }
                }
                if (tagName === 'head' || tagName === 'body') {
                    out.push('\n');
                }
            }
            else if (isSelfClosing || htmlVoidElements.has(tagName)) {
                prevTagType = 'closing';
                if (htmlVoidElements.has(tagName) && str.endsWith(' />')) {
                    str = str.slice(0, -3) + '>';
                }
                const last = out[out.length - 1]?.at(-1) ?? '';
                if (attachesToPrevious || last === ' ') {
                    out.push(str);
                }
                else if (tagName !== 'br' && isWhitespaceSensitive && prevBoundarySensitive && prevTextTrailingWs && last !== '\n') {
                    // A source separator before an inline void element remains a single space.
                    // A zero-width boundary stays attached, while <br> deliberately keeps its
                    // structural line break in the formatted source.
                    out.push(' ' + str);
                }
                else {
                    out.push('\n' + pad(indentationCount) + str);
                }
            }
            else {
                prevTagType = 'opening';
                // A whitespace-sensitive block-ish tag (button, label, svg, custom elements, ...)
                // that isn't inline still must not silently swallow a real source separator: without
                // this, "a <button>" loses its space entirely at the very start of a document (the
                // guard below suppresses the newline there) and relies on a forced '\n' substituting
                // for the space everywhere else — which happens to render the same in a browser, but
                // only coincidentally. Restoring a literal space keeps this correct independent of
                // position. Restricted to the plain block-tag path (matches the exact branch this
                // falls into below) so it can safely also suppress the newline just below.
                // Cheap, already-known booleans first (short-circuits for the vast majority of tags —
                // div, p, li, table, ... — which aren't whitespace-sensitive) so the array/string
                // access below only runs for the rare tag that could actually need it.
                const restoreSpace = isWhitespaceSensitive && !isInline && !isComment && !attachesToPrevious &&
                    prevBoundarySensitive && prevTextTrailingWs && str.length <= lineWrap &&
                    !isTrailingSpaceOrNewline(out[out.length - 1]);
                if (i > 1 && !isInline && !attachesToPrevious && !isComment && !restoreSpace) {
                    out.push('\n');
                }
                if (isComment) {
                    if (i > 1 && !prevBoundarySensitive)
                        out.push('\n');
                    const last = out[out.length - 1]?.at(-1) ?? '';
                    const atLineStart = last === '\n';
                    out.push((atLineStart ? pad(indentationCount) : prevBoundarySensitive && prevTextTrailingWs && last !== ' ' ? ' ' : '') + str);
                }
                else if (str.length > lineWrap) {
                    const tagParts = str.split(/" /g);
                    out.push((attachesToPrevious ? '' : pad(indentationCount)) +
                        tagParts.join('"\n' + pad(indentationCount) + ' '.repeat(tagName.length + 2)));
                }
                else if (isInline) {
                    const last = out[out.length - 1]?.at(-1) ?? '';
                    if (last === '\n') {
                        // At line start — indent normally
                        out.push(pad(indentationCount) + str);
                    }
                    else if (last === '>' || last === ' ') {
                        // Directly after a tag (no text between), or space already present — no
                        // extra space
                        out.push(str);
                    }
                    else if (prevTextTrailingWs) {
                        // After text that had trailing whitespace in the source before htmlTrim()
                        // removed it — restore exactly one space. Checking the source directly
                        // (rather than guessing from the last emitted character) matters: text
                        // with *no* trailing space must not gain one just because the preceding
                        // output happens not to end in '>' or ' ' (e.g. "Leading<em>" in the
                        // source must stay "Leading<em>", not become "Leading <em>").
                        out.push(' ' + str);
                    }
                    else {
                        out.push(str);
                    }
                }
                else if (attachesToPrevious) {
                    out.push(str);
                }
                else if (restoreSpace) {
                    out.push(' ' + str);
                }
                else {
                    out.push(pad(indentationCount) + str);
                }
                // Inline elements, structural anchors, comments, and raw-content blocks do not
                // increment indentation depth
                if (tagName !== 'doctype' && tagName !== 'html' && tagName !== 'svg' && tagName !== '--' && !isInline) {
                    indentationCount++;
                }
                if (tagName === 'html') {
                    out.push('\n');
                }
                if (tagName === 'script' || tagName === 'style') {
                    out.push('\n');
                }
                // Note: <pre> and <svg> content starts immediately after the tag — no extra newline added
            }
            if (isComment) {
                // A comment is a self-contained unit — never left "open" for subsequent
                // content to attach to (matches how a closing tag leaves state).
                prevTagType = 'closing';
            }
            else {
                prevBoundarySensitive = isWhitespaceSensitive;
            }
            prevIndentLength = pad(indentationCount).length;
            prevTag = tagName;
        }
        else {
            // Preserve raw content inside textarea, pre, script, style, svg — do not trim or reformat
            const isRawContent = rawContentTags.has(prevTag) && prevTagType === 'opening';
            // A text node that follows a rendering-sensitive boundary (an inline element's
            // closing tag, or adjacent text) with no separating whitespace in the source
            // must stay attached to the current line even when it wraps — a readability
            // newline at that junction would render as a space that was never in the document.
            let attachesDirectly = false;
            if (!isRawContent) {
                const raw = str;
                const rawStartedWithWs = raw.length > 0 && isHtmlWsCode(raw.charCodeAt(0));
                str = htmlTrim(str).replace(/  +/g, ' ');
                prevTextTrailingWs = raw.length > 0 && isHtmlWsCode(raw.charCodeAt(raw.length - 1));
                // Restore a single leading space after a rendering-sensitive boundary
                // (htmlTrim() strips whitespace between </em>, an inline comment, etc. and the next word)
                if (str && rawStartedWithWs && prevBoundarySensitive) {
                    str = ' ' + str;
                }
                attachesDirectly = prevBoundarySensitive && !rawStartedWithWs;
            }
            else {
                prevTextTrailingWs = false;
            }
            if (!str) {
                if (prevTag === '--' && prevTagType === 'opening') {
                    out.push(' ');
                }
                else if (parts[i] !== '' && prevBoundarySensitive) {
                    // Whitespace-only content between inline elements — preserve as single space,
                    // but not at a phrasing/block boundary where it is layout-only.
                    const nextTag = (parts[i + 1] ?? '').match(/[A-Za-z][A-Za-z0-9-]*/)?.[0]?.toLowerCase() ?? '';
                    if (isWhitespaceSensitiveTag(nextTag))
                        out.push(' ');
                }
                prevIndentLength = pad(indentationCount).length;
                // After an inline boundary the empty gap (e.g. between </a> and </li>)
                // must not erase prevContent — the block element should still see that
                // there was content before it and stay on the same line (singleLine path)
                if (!prevBoundarySensitive) {
                    prevContent = str;
                }
                continue;
            }
            else if (prevTag === 'textarea' || prevTag === 'pre' || prevTag === 'script' || prevTag === 'svg') {
                // Preserve raw content exactly — byte-for-byte, no trimming, no reformatting, and
                // (unlike earlier versions) no reindentation for <script>: a multi-line template
                // literal's continuation line can have zero leading whitespace in the source, and
                // that whitespace is part of the string's runtime value, not code formatting quad
                // could safely touch without a real JS parser. Same reasoning applies to <style>
                // (a CSS string value can span lines too) — see the branch below.
                // <script> collapses to a single line when whitespace-only (readability only,
                // never discards non-whitespace content); the others always emit as-is.
                if (prevTag !== 'script' || htmlTrim(str) !== '') {
                    // The opening/closing <script> tags each push their own separating '\n' —
                    // strip a single leading '\n', and a single trailing '\n' plus any indentation
                    // after it (the closing tag's own leading pad, captured as trailing content on
                    // reprocessing) — so neither doubles up into a blank/indented-only line. Safe:
                    // a line of pure horizontal whitespace right before the closing tag can only
                    // be formatting, never meaningful code.
                    const content = prevTag === 'script' ? str.replace(/^\n/, '').replace(/\n[ \t]*$/, '') : str;
                    out.push(content);
                    if (prevTag === 'script')
                        prevContent = str; // truthy → closing-tag handler will indent </script>
                }
                continue;
            }
            else if (prevTag === 'style') {
                // Preserve CSS content exactly — see the <script> comment above for why this is
                // no longer reindented (same boundary-newline stripping, same reasoning).
                if (htmlTrim(str) !== '') {
                    out.push(str.replace(/^\n/, '').replace(/\n[ \t]*$/, ''));
                    prevContent = str;
                }
                continue;
            }
            const lines = str.split(/\r?\n/g);
            if (lines.length == 1 &&
                prevIndentLength +
                    // Use what was actually emitted for the previous token, not its raw source
                    // text — a long tag that just got wrapped across multiple lines has a raw
                    // source length far bigger than what's actually left on the current visual
                    // line (only the text after its last embedded newline matters here).
                    lastLineLength(out[out.length - 1] ?? '') +
                    lines[0].length +
                    firstLineLength(parts[i + 1] ?? '') <
                    lineWrap) {
                singleLine = true;
                if (prevTag === 'script' || prevTag === 'style') {
                    out.push(pad(indentationCount) + str);
                }
                else {
                    out.push(str);
                }
            }
            else if (attachesDirectly) {
                // The junction to the previous token had no whitespace in the source, so
                // the first run of non-space characters must stay on the current line — a
                // newline there would render as a space that was never in the document.
                // Every break after the first real space is safe, so wrap the remainder
                // normally at the block indent.
                const flat = str.replace(/[\r\n]+/g, ' ').replace(/  +/g, ' ');
                const firstSpace = flat.indexOf(' ');
                if (firstSpace === -1) {
                    out.push(flat + '\n');
                }
                else {
                    const rest = multilines([flat.slice(firstSpace + 1)], pad(indentationCount).length, lineWrap) ?? [];
                    out.push(flat.slice(0, firstSpace) +
                        '\n' + pad(indentationCount) +
                        rest.join('\n' + pad(indentationCount)) +
                        '\n');
                }
                singleLine = false;
            }
            else {
                const content = multilines(lines, pad(indentationCount).length, lineWrap) ?? [];
                out.push('\n' +
                    pad(indentationCount) +
                    content.join('\n' + pad(indentationCount)) +
                    '\n');
                singleLine = false;
            }
            prevIndentLength = pad(indentationCount).length;
            prevContent = str;
            prevBoundarySensitive = true;
        }
    }
    return out.join('');
};
export default htmlFmt;
