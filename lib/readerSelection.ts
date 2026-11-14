/** Remember the actual pointer target: Chromium may snap rt selections to ruby base. */
export function beginScriptSelection(target: EventTarget | null) {
  const layer = target instanceof Element ? target.closest<HTMLElement>('[data-reader-text-kind]') : null;
  const viewport = layer?.closest<HTMLElement>('[data-reader-scroll]');
  if (!viewport || !layer?.dataset.readerTextKind) return;
  viewport.dataset.readerSelectionStartKind = layer.dataset.readerTextKind;
  viewport.dataset.readerSelectionGesture = 'true';
  if (viewport.dataset.readerSelectionKind && viewport.dataset.readerSelectionKind !== layer.dataset.readerTextKind) {
    // Otherwise clicking the invisible half of an existing native selection can
    // start dragging that selection instead of beginning a new one.
    window.getSelection()?.removeAllRanges();
  }
}

export function finishScriptSelection() {
  document.querySelectorAll<HTMLElement>('[data-reader-selection-gesture]').forEach(viewport => delete viewport.dataset.readerSelectionGesture);
}

/** Preserve native selection while showing its highlight on only the anchor layer. */
export function syncScriptSelectionHighlight(selection: Selection | null) {
  const elementOf = (node: Node | null) => node instanceof Element ? node : node?.parentElement;
  const anchor = selection && !selection.isCollapsed ? elementOf(selection.anchorNode)?.closest<HTMLElement>('[data-reader-text-kind]') : null;
  const focus = selection && !selection.isCollapsed ? elementOf(selection.focusNode)?.closest<HTMLElement>('[data-reader-text-kind]') : null;
  for (const viewport of document.querySelectorAll<HTMLElement>('[data-reader-scroll]')) {
    const kind = anchor && focus && viewport.contains(anchor) && viewport.contains(focus)
      ? viewport.dataset.readerSelectionStartKind ?? anchor.dataset.readerTextKind : undefined;
    if (kind === 'phonetic' && anchor?.dataset.readerTextKind !== 'phonetic' && selection?.rangeCount) {
      const anchorRt = elementOf(selection.anchorNode)?.closest('ruby')?.querySelector('rt')?.firstChild;
      const focusRt = elementOf(selection.focusNode)?.closest('ruby')?.querySelector('rt')?.firstChild;
      if (anchorRt && focusRt) {
        const range = selection.getRangeAt(0);
        const backwards = selection.anchorNode === range.endContainer && selection.anchorOffset === range.endOffset;
        // Include the terminal annotation too; native base selection ends before rt.
        selection.setBaseAndExtent(anchorRt, backwards ? anchorRt.textContent?.length ?? 0 : 0,
          focusRt, backwards ? 0 : focusRt.textContent?.length ?? 0);
      }
    }
    if (kind) viewport.dataset.readerSelectionKind = kind;
    else {
      delete viewport.dataset.readerSelectionKind;
      if (!selection || !viewport.dataset.readerSelectionGesture) delete viewport.dataset.readerSelectionStartKind;
    }
    for (const layer of viewport.querySelectorAll<HTMLElement>('[data-reader-text-kind]')) {
      if (kind) {
        // Inheritance follows the normal DOM tree: nested rt overrides its ruby's
        // background without hiding text or changing selection/layout geometry.
        const background = layer.dataset.readerTextKind === kind ? '#bfdbfe' : 'transparent';
        if (layer.style.getPropertyValue('--reader-selection-background') !== background) layer.style.setProperty('--reader-selection-background', background);
      } else layer.style.removeProperty('--reader-selection-background');
    }
  }
}

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

/** Keep the current selection or playback target in an unobstructed vertical band. */
export function revealScriptSelection(viewport: HTMLElement, range: Range | null, fallback: HTMLElement | null, follow = false): void {
  const visualViewport = window.visualViewport;
  const viewportBounds = viewport.getBoundingClientRect();
  const top = Math.max(viewportBounds.top, visualViewport?.offsetTop ?? 0) + 12;
  const bottom = Math.min(viewportBounds.bottom,
    (visualViewport?.offsetTop ?? 0) + (visualViewport?.height ?? window.innerHeight)) - 12;
  if (bottom <= top) return;
  const rects = range && !range.collapsed && viewport.contains(range.commonAncestorContainer)
    ? Array.from(range.getClientRects()).filter(rect => rect.width > 0 && rect.height > 0) : [];
  const target = rects.length ? {
    top: Math.min(...rects.map(rect => rect.top)), bottom: Math.max(...rects.map(rect => rect.bottom)),
    left: Math.min(...rects.map(rect => rect.left)), right: Math.max(...rects.map(rect => rect.right)),
  } : fallback?.getBoundingClientRect();
  const obstacles: { top: number; bottom: number }[] = [];
  let clearance = 0;
  for (const panel of document.querySelectorAll<HTMLElement>('[data-reader-panels], [data-reader-selection-controls], [data-audio-player], [data-reader-tools]')) {
    const bounds = panel.getBoundingClientRect();
    if (!bounds.width || !bounds.height || bounds.left >= viewportBounds.right - 1 || bounds.right <= viewportBounds.left + 1 || bounds.bottom <= top || bounds.top >= bottom) continue;
    if (target && bounds.left < target.right && bounds.right > target.left) {
      // Extra scroll space lets even the first/last line escape a floating player.
      clearance = Math.max(clearance, Math.min(bottom, bounds.bottom) - Math.max(top, bounds.top) + 24);
      obstacles.push({ top: Math.max(top, bounds.top - 12), bottom: Math.min(bottom, bounds.bottom + 12) });
    }
  }
  const value = `${clearance}px`;
  if (viewport.style.getPropertyValue('--reader-overlay-clearance') !== value) {
    viewport.style.setProperty('--reader-overlay-clearance', value);
    // Padding moves text; measure the new geometry before deciding how far to move.
    return revealScriptSelection(viewport, range, fallback, follow);
  }
  if (!target) return;
  const bands: { top: number; bottom: number }[] = [];
  let cursor = top;
  for (const obstacle of obstacles.sort((a, b) => a.top - b.top)) {
    if (obstacle.top > cursor) bands.push({ top: cursor, bottom: obstacle.top });
    cursor = Math.max(cursor, obstacle.bottom);
  }
  if (cursor < bottom) bands.push({ top: cursor, bottom });
  if (!bands.length) return;
  const height = target.bottom - target.top;
  const fitting = bands.filter(band => band.bottom - band.top >= height);
  const candidates = fitting.length ? fitting : [bands.reduce((a, b) => a.bottom - a.top >= b.bottom - b.top ? a : b)];
  const moves = candidates.map(band => {
    const available = band.bottom - band.top;
    // Oversized selections retain their beginning; an entire paragraph may not fit.
    if (height > available) return target.top - band.top;
    if (follow) {
      if (target.top >= band.top + available * 0.25 && target.bottom <= band.top + available * 0.7) return 0;
      return (target.top + target.bottom - band.top - band.bottom) / 2;
    }
    return target.top < band.top ? target.top - band.top : target.bottom > band.bottom ? target.bottom - band.bottom : 0;
  });
  const delta = moves.reduce((a, b) => Math.abs(a) <= Math.abs(b) ? a : b);
  if (Math.abs(delta) > 1) viewport.scrollBy({ top: delta, behavior: 'instant' });
}
