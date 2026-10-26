import type { Anchor } from './types';
export function resolveAnchor(text: string, a: Anchor): { start: number; end: number } | null {
  if (!a.quote) return null;
  if (a.start !== undefined && text.slice(a.start, a.start + a.quote.length) === a.quote)
    return { start: a.start, end: a.start + a.quote.length };
  let best = -1,
    score = -1,
    pos = text.indexOf(a.quote);
  while (pos >= 0) {
    let s = 0;
    if (a.prefix && text.slice(Math.max(0, pos - a.prefix.length), pos) === a.prefix) s += 2;
    if (
      a.suffix &&
      text.slice(pos + a.quote.length, pos + a.quote.length + a.suffix.length) === a.suffix
    )
      s += 2;
    if (s > score) {
      score = s;
      best = pos;
    }
    pos = text.indexOf(a.quote, pos + 1);
  }
  return best < 0 ? null : { start: best, end: best + a.quote.length };
}
export function rangeAt(root: HTMLElement, start: number, end: number): Range | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  let offset = 0;
  const range = document.createRange();
  let started = false;
  while ((node = walker.nextNode())) {
    const len = node.textContent?.length || 0;
    if (!started && start < offset + len) {
      range.setStart(node, Math.max(0, start - offset));
      started = true;
    }
    if (started && end <= offset + len) {
      range.setEnd(node, Math.max(0, end - offset));
      return range;
    }
    offset += len;
  }
  return null;
}
export function selectionAnchor(root: HTMLElement, page: number, range: Range): Anchor {
  const pre = document.createRange();
  pre.selectNodeContents(root);
  pre.setEnd(range.startContainer, range.startOffset);
  const start = pre.toString().length;
  const quote = range.toString();
  const text = root.textContent || '';
  return {
    page,
    quote,
    start,
    end: start + quote.length,
    prefix: text.slice(Math.max(0, start - 32), start),
    suffix: text.slice(start + quote.length, start + quote.length + 32),
  };
}
