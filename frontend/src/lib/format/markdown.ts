// Minimal inline-markdown formatter for message text. Recognises three
// markers — `**bold**`, `_italic_`, `` `code` `` — and leaves everything
// else, including unmatched, empty, or nested markers, as literal text.
//
// Same spirit as `linkify`: one regex pass, no nesting, no deps,
// conservative. Run this only on the *text* runs of a linkified message,
// so URL / email runs (which legitimately contain `_`) are never touched.
//
// Returns runs rather than HTML so callers render through Svelte's normal
// text-escaping path — no `{@html}`, no XSS surface.

export type MdStyle = 'bold' | 'italic' | 'code' | null;
export type MdRun = { text: string; style: MdStyle };

// `**…**` / `` `…` ``: non-empty, no same-marker char inside, markers hug a
// non-space char. `_…_`: same, plus word-boundary guards (no letter/digit
// either side) so `snake_case` and `a_b_c` keep their underscores — only
// underscores that border whitespace or punctuation form an italic pair.
// A code span matches as one unit, so `**`/`_` inside backticks stay
// literal automatically.
const MD_RE =
  /\*\*(?=\S)([^*]+?)(?<=\S)\*\*|`(?=\S)([^`]+?)(?<=\S)`|(?<![\p{L}\p{N}])_(?=\S)([^_]+?)(?<=\S)_(?![\p{L}\p{N}])/gu;

export function parseInlineMarkdown(input: string): MdRun[] {
  if (!input) return [];
  const runs: MdRun[] = [];
  let last = 0;
  for (const m of input.matchAll(MD_RE)) {
    const start = m.index ?? 0;
    if (start > last) runs.push({ text: input.slice(last, start), style: null });
    runs.push(
      m[1] !== undefined
        ? { text: m[1], style: 'bold' }
        : m[2] !== undefined
          ? { text: m[2], style: 'code' }
          : { text: m[3], style: 'italic' },
    );
    last = start + m[0].length;
  }
  if (last < input.length) runs.push({ text: input.slice(last), style: null });
  return runs.length === 0 ? [{ text: input, style: null }] : runs;
}
