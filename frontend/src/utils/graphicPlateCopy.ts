/** Read/write headline + key inside generated overlay HTML without touching scripts. */

const CLASS_RE = (cls: string) =>
    new RegExp(
        `(<(?:div|h1|h2|h3|p|span)(?=[^>]*\\bclass=["'][^"']*\\b${cls}\\b)[^>]*>)([\\s\\S]*?)(</(?:div|h1|h2|h3|p|span)>)`,
        'i'
    );

function stripTags(html: string): string {
    return html
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/\s+/g, ' ')
        .trim();
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function extractClassText(html: string, cls: string): string {
    const m = html.match(CLASS_RE(cls));
    return m ? stripTags(m[2]) : '';
}

function replaceClassText(html: string, cls: string, text: string): string {
    const re = CLASS_RE(cls);
    if (!re.test(html)) return html;
    return html.replace(re, (_, open, _inner, close) => `${open}${escapeHtml(text)}${close}`);
}

export function extractPlateCopy(html: string): { headline: string; key: string } {
    const headline =
        extractClassText(html, 'headline') ||
        extractClassText(html, 'title') ||
        (() => {
            const m = html.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i);
            return m ? stripTags(m[1]) : '';
        })();
    const key = extractClassText(html, 'key') || extractClassText(html, 'stat');
    return { headline, key };
}

export function replacePlateCopy(html: string, headline: string, key: string): string {
    let next = html;
    if (CLASS_RE('headline').test(next)) {
        next = replaceClassText(next, 'headline', headline);
    } else if (/<h[1-3][^>]*>[\s\S]*?<\/h[1-3]>/i.test(next)) {
        next = next.replace(
            /(<h[1-3][^>]*>)([\s\S]*?)(<\/h[1-3]>)/i,
            (_, open, _inner, close) => `${open}${escapeHtml(headline)}${close}`
        );
    }
    if (CLASS_RE('key').test(next)) {
        next = replaceClassText(next, 'key', key);
    } else if (CLASS_RE('stat').test(next)) {
        next = replaceClassText(next, 'stat', key);
    }
    return next;
}
