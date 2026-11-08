/** Read only the text layer where a script selection began, including partial words. */
export function getScriptSelection(selection: Selection | null) {
  if (!selection?.rangeCount || selection.isCollapsed) return null;
  const elementOf = (node: Node | null) => node instanceof Element ? node : node?.parentElement;
  const anchor = elementOf(selection.anchorNode)?.closest<HTMLElement>('[data-reader-text-kind]');
  const focus = elementOf(selection.focusNode)?.closest<HTMLElement>('[data-reader-text-kind]');
  const viewport = anchor?.closest('[data-reader-scroll]');
  if (!anchor || !focus || !viewport || !viewport.contains(focus)) return null;
  const kind = anchor.dataset.readerTextKind;
  const range = selection.getRangeAt(0);
  const walker = document.createTreeWalker(viewport, NodeFilter.SHOW_TEXT);
  const lines: string[] = [];
  let lineId: string | undefined;
  let previousWord: Element | null = null;
  let text = '';
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const element = node.parentElement;
    if (element?.closest<HTMLElement>('[data-reader-text-kind]')?.dataset.readerTextKind !== kind || !range.intersectsNode(node)) continue;
    const value = (node.textContent ?? '').slice(
      range.startContainer === node ? range.startOffset : 0,
      range.endContainer === node ? range.endOffset : undefined,
    );
    if (!value) continue;
    const nextLineId = element?.closest<HTMLElement>('[data-selection-line]')?.dataset.selectionLine;
    if (lineId !== undefined && nextLineId !== lineId) {
      lines.push(text.trim()); text = ''; previousWord = null;
    }
    lineId = nextLineId;
    const word = element?.closest('[data-reader-copy-word]') ?? null;
    // IPA tokens and the legacy flex layout have visual gaps without text spaces.
    if (text && !/\s$/.test(text) && !/^\s/.test(value) &&
      ((kind === 'phonetic' && element?.closest('rt')) || (word && previousWord && word !== previousWord))) text += ' ';
    text += value;
    previousWord = word;
  }
  if (text.trim()) lines.push(text.trim());
  return { text: lines.join('\n'), kind, range: range.cloneRange() };
}

/** Keep a selected passage inside the space left above bottom panels. */
export function revealScriptSelection(viewport: HTMLElement, range: Range | null, fallback: HTMLElement | null) {
  const visualViewport = window.visualViewport;
  const viewportBounds = viewport.getBoundingClientRect();
  const top = Math.max(viewportBounds.top, visualViewport?.offsetTop ?? 0) + 12;
  let bottom = Math.min(viewportBounds.bottom,
    (visualViewport?.offsetTop ?? 0) + (visualViewport?.height ?? window.innerHeight)) - 12;
  for (const panel of document.querySelectorAll<HTMLElement>('[data-reader-panels], [data-reader-selection-controls], [data-audio-player]')) {
    const bounds = panel.getBoundingClientRect();
    // Side panels do not reduce the script's usable height.
    if (bounds.width && bounds.height && bounds.left < viewportBounds.right - 1 && bounds.right > viewportBounds.left + 1 &&
      bounds.top > top && bounds.top < bottom && bounds.bottom >= viewportBounds.bottom - 2) bottom = bounds.top - 12;
  }
  if (bottom <= top) return;
  const rects = range && viewport.contains(range.commonAncestorContainer)
    ? Array.from(range.getClientRects()).filter(rect => rect.width > 0 && rect.height > 0) : [];
  const bounds = rects.length ? {
    top: Math.min(...rects.map(rect => rect.top)), bottom: Math.max(...rects.map(rect => rect.bottom)),
  } : fallback?.getBoundingClientRect();
  if (!bounds) return;
  const available = bottom - top;
  // A passage taller than the viewport can only show its beginning.
  const delta = bounds.bottom - bounds.top > available
    ? bounds.top - top
    : bounds.top < top ? bounds.top - top : bounds.bottom > bottom ? bounds.bottom - bottom : 0;
  if (Math.abs(delta) > 1) viewport.scrollBy({ top: delta, behavior: 'instant' });
}
