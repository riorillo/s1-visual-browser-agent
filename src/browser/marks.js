/**
 * Draws the numbered boxes of one observation over the page, in viewport coordinates.
 * `scripts.draw` calls it with the marks of that observation, so the numbers on the frame
 * are the element indexes the policy asks about. A box covers the part of its element that
 * can actually be clicked: it is cut to the viewport and to every clipping ancestor, so a
 * covered, scrolled away or clipped element is never outlined where a click cannot land.
 * The overlay measures the space it draws in instead of assuming it, so a page that scales
 * or translates its own root neither shifts nor scales the boxes. It draws in the top layer
 * when it can, so the numbers of a modal dialog stay visible over it. The overlay is inert,
 * hidden from assistive reading and from the state reader, and a draw replaces any older one.
 */
marks => {
  const nodes = window.__jevFast?.nodes;
  document.querySelectorAll('[data-jev-marks]').forEach(host => host.remove());
  if (!nodes || !document.documentElement) return 0;
  const host = document.createElement('div');
  host.setAttribute('data-jev-marks', '');
  host.setAttribute('aria-hidden', 'true');
  Object.assign(host.style, {
    position: 'fixed',
    inset: '0 auto auto 0',
    width: '100%',
    height: '100%',
    margin: '0',
    border: '0',
    padding: '0',
    background: 'transparent',
    overflow: 'visible',
    pointerEvents: 'none',
    zIndex: '2147483647',
  });
  document.documentElement.appendChild(host);
  // A dialog opened with showModal paints in the top layer, where no z-index reaches: the
  // numbers of a modal would hide under it. A manual popover joins that layer and, shown
  // last, stays above the dialog. An engine without popovers keeps the plain overlay, and
  // the attribute goes away with the attempt: left behind, it would hide the overlay.
  try {
    host.setAttribute('popover', 'manual');
    host.showPopover();
  } catch {
    host.removeAttribute('popover');
  }
  const space = measure(host);
  const clips = new Map();
  for (const mark of marks) {
    const node = nodes.get(mark.node);
    const rect = node?.isConnected ? visible(node, node.getBoundingClientRect(), clips) : null;
    if (rect) host.appendChild(box(rect, mark.index, space));
  }
  if (!host.firstChild) host.remove();
  return host.childElementCount;

  /**
   * How the coordinates of the overlay map to the viewport, measured with a probe: an
   * overlay inside a scaled or translated root moves and scales with it.
   */
  function measure(host) {
    const probe = document.createElement('div');
    Object.assign(probe.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      width: '100px',
      height: '100px',
      visibility: 'hidden',
    });
    host.appendChild(probe);
    const rect = probe.getBoundingClientRect();
    probe.remove();
    return { x: rect.left, y: rect.top, sx: rect.width / 100 || 1, sy: rect.height / 100 || 1 };
  }

  /**
   * The parent a box is clipped by, which is the host when the node lives in a shadow root: a
   * light chain stops at the root that holds the node, so the box would lose every clip above it.
   */
  function clipParent(node) {
    const root = node.getRootNode();
    return node.parentElement ?? (root instanceof ShadowRoot ? root.host : null);
  }

  /** The whole pixel bounds left of the element once every clipping box has cut it. */
  function visible(node, rect, clips) {
    if (!rect.width || !rect.height) return null;
    let left = Math.max(rect.left, 0);
    let top = Math.max(rect.top, 0);
    let right = Math.min(rect.right, innerWidth);
    let bottom = Math.min(rect.bottom, innerHeight);
    // The clip of a box comes from the ancestors that hide part of it, and a host hides what
    // is inside its shadow root as much as a scroll container hides its own children.
    for (let parent = clipParent(node); parent && parent !== document.documentElement; parent = clipParent(parent)) {
      const clip = clipOf(parent, clips);
      if (!clip) continue;
      left = Math.max(left, clip.left);
      top = Math.max(top, clip.top);
      right = Math.min(right, clip.right);
      bottom = Math.min(bottom, clip.bottom);
    }
    // A border on a fractional edge covers two rows of pixels at half strength, which reads
    // as a box that is off its element, so every edge lands on a whole pixel.
    left = Math.floor(left);
    top = Math.floor(top);
    right = Math.ceil(right);
    bottom = Math.ceil(bottom);
    if (right - left < 2 || bottom - top < 2) return null;
    return { left, top, width: right - left, height: bottom - top };
  }

  /** The box an ancestor clips its content to, or null when it clips nothing. Measured once. */
  function clipOf(el, clips) {
    if (clips.has(el)) return clips.get(el);
    const style = getComputedStyle(el);
    const cuts = value => Boolean(value) && value !== 'visible';
    let clip = null;
    if (cuts(style.overflowX) || cuts(style.overflowY) || cuts(style.overflow)) {
      const rect = el.getBoundingClientRect();
      const edge = value => parseFloat(value) || 0;
      // A scroll container clips its content to its padding box, scrollbars excluded: a box
      // that reached over a border or a scrollbar would outline pixels no click can land on.
      // The borders and gutters are layout pixels, so they follow the scale of the rect.
      const sx = el.offsetWidth ? rect.width / el.offsetWidth : 1;
      const sy = el.offsetHeight ? rect.height / el.offsetHeight : 1;
      const vbar = el.offsetWidth - el.clientWidth - edge(style.borderLeftWidth) - edge(style.borderRightWidth);
      const hbar = el.offsetHeight - el.clientHeight - edge(style.borderTopWidth) - edge(style.borderBottomWidth);
      const left = edge(style.borderLeftWidth);
      const right = edge(style.borderRightWidth);
      // A right-to-left box puts its vertical scrollbar on the left edge.
      const near = style.direction === 'rtl' ? left + vbar : left;
      const far = style.direction === 'rtl' ? right : right + vbar;
      clip = {
        left: rect.left + near * sx,
        top: rect.top + edge(style.borderTopWidth) * sy,
        right: rect.right - far * sx,
        bottom: rect.bottom - (edge(style.borderBottomWidth) + hbar) * sy,
      };
    }
    clips.set(el, clip);
    return clip;
  }

  /** One box of the element, with its number in its own top left corner. */
  function box(rect, index, space) {
    const frame = document.createElement('div');
    Object.assign(frame.style, {
      position: 'absolute',
      left: `${(rect.left - space.x) / space.sx}px`,
      top: `${(rect.top - space.y) / space.sy}px`,
      width: `${rect.width / space.sx}px`,
      height: `${rect.height / space.sy}px`,
      // The overlay is drawn in the space it measures, so its own strokes are divided by the
      // same scale: a border stays two pixels of the frame whatever the page does.
      border: `${2 / space.sx}px solid #d1002f`,
      boxSizing: 'border-box',
    });
    const badge = document.createElement('span');
    badge.textContent = index;
    Object.assign(badge.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      padding: `0 ${4 / space.sx}px`,
      background: '#d1002f',
      color: '#ffffff',
      font: `bold ${11 / space.sx}px/${14 / space.sx}px ui-monospace, monospace`,
      whiteSpace: 'nowrap',
    });
    frame.appendChild(badge);
    return frame;
  }
}
