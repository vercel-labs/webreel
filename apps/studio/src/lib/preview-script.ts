const CURSOR_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87c.45 0 .67-.54.35-.85L5.85 2.35a.5.5 0 0 0-.35.86z" fill="#fff" stroke="#000" stroke-width="1.5" stroke-linejoin="round"/></svg>';

export const PREVIEW_SCRIPT = `
(function() {
  var CURSOR_SVG = ${JSON.stringify(CURSOR_SVG)};
  var DEFAULT_CURSOR_SIZE = 24;
  var DEFAULT_HUD = {
    background: 'rgba(0,0,0,0.5)',
    color: 'rgba(255,255,255,0.85)',
    fontSize: 56,
    fontFamily: '"Geist", -apple-system, BlinkMacSystemFont, sans-serif',
    borderRadius: 18,
    position: 'bottom'
  };

  var config = {
    cursor: { size: DEFAULT_CURSOR_SIZE, hotspot: 'top-left' },
    hud: Object.assign({}, DEFAULT_HUD),
    viewport: { width: 1920, height: 1080 }
  };

  var cursorX = -40, cursorY = -40;
  var animFrame = null;

  // ─── Create overlay elements ───────────────────────────────────────────────

  var cursor = document.createElement('div');
  cursor.id = '__wr-cursor';
  cursor.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483646;pointer-events:none;will-change:transform;transform-origin:top left;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.5));display:none;';
  cursor.innerHTML = CURSOR_SVG;
  document.documentElement.appendChild(cursor);

  var highlight = document.createElement('div');
  highlight.id = '__wr-highlight';
  highlight.style.cssText = 'position:fixed;z-index:2147483644;pointer-events:none;border:2px solid #10b981;background:rgba(16,185,129,0.08);border-radius:3px;transition:all 150ms ease;display:none;';
  document.documentElement.appendChild(highlight);

  var highlightLabel = document.createElement('div');
  highlightLabel.id = '__wr-highlight-label';
  highlightLabel.style.cssText = 'position:fixed;z-index:2147483644;pointer-events:none;background:#065f46;color:#d1fae5;font:10px/1.3 ui-monospace,SFMono-Regular,Menlo,monospace;padding:2px 6px;border-radius:3px 3px 0 0;white-space:nowrap;display:none;max-width:300px;overflow:hidden;text-overflow:ellipsis;';
  document.documentElement.appendChild(highlightLabel);

  var hud = document.createElement('div');
  hud.id = '__wr-hud';
  hud.style.cssText = 'position:fixed;z-index:2147483645;pointer-events:none;left:50%;transform:translateX(-50%);display:flex;gap:14px;padding:16px 36px;opacity:0;transition:opacity 150ms ease;';
  document.documentElement.appendChild(hud);

  var hudStyle = document.createElement('style');
  hudStyle.textContent = '.__wr-key{display:inline-flex;align-items:center;justify-content:center;font-weight:500;white-space:nowrap;}';
  document.head.appendChild(hudStyle);

  var rippleStyle = document.createElement('style');
  rippleStyle.textContent = '@keyframes __wr-ripple{0%{transform:translate(-50%,-50%) scale(0);opacity:0.5;}100%{transform:translate(-50%,-50%) scale(1);opacity:0;}}.__wr-ripple-ring{position:fixed;pointer-events:none;z-index:2147483645;border:2px solid #10b981;border-radius:50%;width:40px;height:40px;animation:__wr-ripple 400ms ease-out forwards;}';
  document.head.appendChild(rippleStyle);

  var progressBadge = document.createElement('div');
  progressBadge.id = '__wr-progress';
  progressBadge.style.cssText = 'position:fixed;top:12px;right:12px;z-index:2147483645;pointer-events:none;background:rgba(0,0,0,0.7);color:#fff;font:11px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;padding:4px 10px;border-radius:6px;display:none;';
  document.documentElement.appendChild(progressBadge);

  // ─── Cursor helpers ────────────────────────────────────────────────────────

  function updateCursorStyle() {
    var size = config.cursor.size || DEFAULT_CURSOR_SIZE;
    var hotspot = config.cursor.hotspot || 'top-left';
    var marginL = hotspot === 'center' ? -(size / 2) : 0;
    var marginT = hotspot === 'center' ? -(size / 2) : 0;
    cursor.style.width = size + 'px';
    cursor.style.height = size + 'px';
    cursor.style.marginLeft = marginL + 'px';
    cursor.style.marginTop = marginT + 'px';
    var svg = cursor.querySelector('svg');
    if (svg) {
      svg.setAttribute('width', String(size));
      svg.setAttribute('height', String(size));
    }
  }

  function updateHudStyle() {
    var h = config.hud;
    hud.style.background = h.background || DEFAULT_HUD.background;
    hud.style.borderRadius = (h.borderRadius != null ? h.borderRadius : DEFAULT_HUD.borderRadius) + 'px';
    hud.style.top = '';
    hud.style.bottom = '';
    hud.style[(h.position || DEFAULT_HUD.position)] = '48px';
    hudStyle.textContent = '.__wr-key{display:inline-flex;align-items:center;justify-content:center;color:' + (h.color || DEFAULT_HUD.color) + ';font-family:' + (h.fontFamily || DEFAULT_HUD.fontFamily) + ';font-size:' + (h.fontSize != null ? h.fontSize : DEFAULT_HUD.fontSize) + 'px;font-weight:500;white-space:nowrap;}';
  }

  function setCursorPos(x, y) {
    cursorX = x;
    cursorY = y;
    cursor.style.transform = 'translate(' + x + 'px,' + y + 'px)';
    cursor.style.display = '';
  }

  // ─── Cursor motion (ported from @webreel/core cursor-motion.ts) ────────────

  function moveDuration(distance) {
    return 180 + 16 * Math.sqrt(distance) + (Math.random() - 0.5) * 30;
  }

  function humanEase(t) {
    var mid = 0.4;
    if (t <= mid) {
      var s = t / mid;
      return 0.5 * s * s;
    }
    var s2 = (t - mid) / (1 - mid);
    return 0.5 + 0.5 * (1 - (1 - s2) * (1 - s2) * (1 - s2));
  }

  function bezierControl(x0, y0, x1, y1, dist) {
    var mx = (x0 + x1) / 2;
    var my = (y0 + y1) / 2;
    if (dist < 80) return { x: mx, y: my };
    var px = -(y1 - y0) / dist;
    var py = (x1 - x0) / dist;
    var offset = dist * (0.03 + Math.random() * 0.07) * (Math.random() < 0.5 ? -1 : 1);
    return { x: mx + px * offset, y: my + py * offset };
  }

  function evalBezier(t, p0, p1, p2) {
    var m = 1 - t;
    return {
      x: m * m * p0.x + 2 * m * t * p1.x + t * t * p2.x,
      y: m * m * p0.y + 2 * m * t * p1.y + t * t * p2.y
    };
  }

  function microJitter(t, dist) {
    var bell = Math.exp(-8 * (t - 0.5) * (t - 0.5));
    var mag = Math.min(0.4, dist * 0.0004) * bell;
    return {
      x: (Math.random() - 0.5) * 2 * mag,
      y: (Math.random() - 0.5) * 2 * mag
    };
  }

  function animateCursorTo(toX, toY, speedMult) {
    return new Promise(function(resolve) {
      if (animFrame) cancelAnimationFrame(animFrame);
      var fromX = cursorX, fromY = cursorY;
      var dx = toX - fromX, dy = toY - fromY;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1) { setCursorPos(toX, toY); resolve(); return; }

      var mult = speedMult || 1;
      var duration = moveDuration(dist) / mult;
      var ctrl = bezierControl(fromX, fromY, toX, toY, dist);
      var p0 = { x: fromX, y: fromY };
      var p2 = { x: toX, y: toY };
      var start = null;

      cursor.style.display = '';

      function tick(ts) {
        if (!start) start = ts;
        var elapsed = ts - start;
        var rawT = Math.min(elapsed / duration, 1);
        var t = humanEase(rawT);
        var pos = evalBezier(t, p0, ctrl, p2);
        var jitter = dist > 60 ? microJitter(rawT, dist) : { x: 0, y: 0 };
        var x = Math.round((pos.x + jitter.x) * 10) / 10;
        var y = Math.round((pos.y + jitter.y) * 10) / 10;
        setCursorPos(x, y);
        if (rawT < 1) {
          animFrame = requestAnimationFrame(tick);
        } else {
          setCursorPos(toX, toY);
          animFrame = null;
          resolve();
        }
      }
      animFrame = requestAnimationFrame(tick);
    });
  }

  // ─── Element finding ───────────────────────────────────────────────────────

  function findBySelector(selector, within) {
    try {
      var scope = document;
      if (within) {
        var w = document.querySelector(within);
        if (w) scope = w;
      }
      return scope.querySelector(selector);
    } catch(e) { return null; }
  }

  function findByText(text, within) {
    var scope = document.body;
    if (within) {
      try {
        var w = document.querySelector(within);
        if (w) scope = w;
      } catch(e) {}
    }
    var walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, null);
    while (walker.nextNode()) {
      var node = walker.currentNode;
      if (node.textContent && node.textContent.trim().includes(text)) {
        return node.parentElement;
      }
    }
    return null;
  }

  function findElement(opts) {
    if (!opts) return null;
    if (opts.selector) return findBySelector(opts.selector, opts.within);
    if (opts.text) return findByText(opts.text, opts.within);
    return null;
  }

  function getElementRect(el) {
    if (!el) return null;
    var r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  }

  function randomPointInRect(rect) {
    var px = 0.3 + Math.random() * 0.4;
    var py = 0.3 + Math.random() * 0.4;
    return {
      x: Math.round(rect.x + rect.width * px),
      y: Math.round(rect.y + rect.height * py)
    };
  }

  // ─── Highlight ─────────────────────────────────────────────────────────────

  function showHighlight(opts) {
    var el = findElement(opts);
    if (!el) {
      highlight.style.display = 'none';
      highlightLabel.style.display = 'none';
      reply('webreel:highlight:result', { found: false, rect: null });
      return;
    }

    var rect = getElementRect(el);
    highlight.style.left = rect.x + 'px';
    highlight.style.top = rect.y + 'px';
    highlight.style.width = rect.width + 'px';
    highlight.style.height = rect.height + 'px';
    highlight.style.display = '';

    var labelText = opts.selector || opts.text || '';
    if (labelText) {
      highlightLabel.textContent = labelText;
      highlightLabel.style.left = rect.x + 'px';
      highlightLabel.style.top = (rect.y - 20) + 'px';
      highlightLabel.style.display = '';
    }

    scrollIntoViewIfNeeded(el);
    reply('webreel:highlight:result', { found: true, rect: rect });
  }

  function clearHighlight() {
    highlight.style.display = 'none';
    highlightLabel.style.display = 'none';
  }

  function scrollIntoViewIfNeeded(el) {
    var rect = el.getBoundingClientRect();
    if (rect.top < 0 || rect.bottom > window.innerHeight ||
        rect.left < 0 || rect.right > window.innerWidth) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }
  }

  // ─── HUD ───────────────────────────────────────────────────────────────────

  function showHudLabels(labels) {
    hud.innerHTML = labels.map(function(k) {
      var e = k.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      return '<span class="__wr-key">' + e + '</span>';
    }).join('');
    hud.style.opacity = '1';
  }

  function hideHud() {
    hud.style.opacity = '0';
  }

  // ─── Click ripple ──────────────────────────────────────────────────────────

  function spawnRipple(x, y) {
    var ring = document.createElement('div');
    ring.className = '__wr-ripple-ring';
    ring.style.left = x + 'px';
    ring.style.top = y + 'px';
    document.documentElement.appendChild(ring);
    setTimeout(function() { ring.remove(); }, 450);
  }

  // ─── Cursor press effect ───────────────────────────────────────────────────

  function cursorDown() {
    cursor.style.transition = 'transform 0.1s ease';
    cursor.style.transform = 'translate(' + cursorX + 'px,' + cursorY + 'px) scale(0.75)';
  }

  function cursorUp() {
    cursor.style.transform = 'translate(' + cursorX + 'px,' + cursorY + 'px) scale(1)';
    setTimeout(function() { cursor.style.transition = ''; }, 120);
  }

  // ─── Progress badge ────────────────────────────────────────────────────────

  function showProgress(current, total, label) {
    progressBadge.textContent = (current + 1) + '/' + total + (label ? ' - ' + label : '');
    progressBadge.style.display = '';
  }

  function hideProgress() {
    progressBadge.style.display = 'none';
  }

  // ─── Scroll ────────────────────────────────────────────────────────────────

  function scrollElement(opts) {
    var target = window;
    if (opts.selector) {
      var el = findBySelector(opts.selector, opts.within);
      if (el) target = el;
    }
    target.scrollBy({ left: opts.x || 0, top: opts.y || 0, behavior: 'smooth' });
  }

  // ─── Type into input ──────────────────────────────────────────────────────

  function typeIntoElement(el, text, charDelay, speedMult) {
    return new Promise(function(resolve) {
      if (!el || !('value' in el)) { resolve(); return; }
      var mult = speedMult || 1;
      var delay = (charDelay || 80) / mult;
      var i = 0;
      function next() {
        if (i >= text.length) { resolve(); return; }
        el.value += text[i];
        el.dispatchEvent(new Event('input', { bubbles: true }));
        i++;
        setTimeout(next, delay);
      }
      next();
    });
  }

  // ─── Screenshot flash ─────────────────────────────────────────────────────

  function flash() {
    var f = document.createElement('div');
    f.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#fff;opacity:0.6;pointer-events:none;transition:opacity 300ms ease;';
    document.documentElement.appendChild(f);
    requestAnimationFrame(function() {
      f.style.opacity = '0';
      setTimeout(function() { f.remove(); }, 350);
    });
  }

  // ─── Step simulation ──────────────────────────────────────────────────────

  var aborted = false;

  function sleep(ms) {
    return new Promise(function(r) { setTimeout(r, ms); });
  }

  function simulateStep(step, index, total, speed) {
    if (aborted) return Promise.resolve();
    var mult = speed || 1;
    var action = step.action;
    var delay = (step.delay || 0) / mult;

    showProgress(index, total, action);

    switch (action) {
      case 'click': return doClick(step, mult).then(function() { return sleep(delay); });
      case 'type': return doType(step, mult).then(function() { return sleep(delay); });
      case 'key': return doKey(step, mult).then(function() { return sleep(delay); });
      case 'hover':
      case 'moveTo': return doMoveTo(step, mult).then(function() { return sleep(delay); });
      case 'scroll': return doScroll(step, mult).then(function() { return sleep(delay); });
      case 'pause': return sleep((step.ms || 500) / mult);
      case 'wait': return doWait(step, mult).then(function() { return sleep(delay); });
      case 'navigate': return doNavigate(step).then(function() { return sleep(delay); });
      case 'drag': return doDrag(step, mult).then(function() { return sleep(delay); });
      case 'screenshot': flash(); return sleep(500 / mult).then(function() { return sleep(delay); });
      case 'select': return doSelect(step, mult).then(function() { return sleep(delay); });
      default: return sleep(300 / mult);
    }
  }

  function doClick(step, mult) {
    var el = findElement(step);
    var rect = el ? getElementRect(el) : null;
    if (el) showHighlight(step);

    var target = rect ? randomPointInRect(rect) : { x: cursorX, y: cursorY };
    var clickDwell = (step.clickDwell || 120) / mult;

    var modLabels = [];
    if (step.modifiers && step.modifiers.length) {
      modLabels = step.modifiers.slice();
    }
    if (step.label) modLabels.push(step.label);

    return animateCursorTo(target.x, target.y, mult)
      .then(function() {
        if (modLabels.length) showHudLabels(modLabels);
        cursorDown();
        spawnRipple(target.x, target.y);
        return sleep(clickDwell);
      })
      .then(function() {
        cursorUp();
        if (modLabels.length) return sleep(400 / mult).then(hideHud);
        return sleep(80 / mult);
      })
      .then(function() { clearHighlight(); });
  }

  function doType(step, mult) {
    var el = findElement(step);
    if (el) showHighlight(step);
    var rect = el ? getElementRect(el) : null;
    var target = rect ? randomPointInRect(rect) : { x: cursorX, y: cursorY };
    var text = step.text || '';

    return animateCursorTo(target.x, target.y, mult)
      .then(function() {
        cursorDown();
        return sleep(80 / mult);
      })
      .then(function() {
        cursorUp();
        return sleep(80 / mult);
      })
      .then(function() {
        if (el) return typeIntoElement(el, text, step.charDelay, mult);
        return Promise.resolve();
      })
      .then(function() {
        var chars = text.split('');
        var idx = 0;
        function showNext() {
          if (idx >= chars.length || aborted) return Promise.resolve();
          var partial = text.substring(0, idx + 1);
          showHudLabels([partial]);
          idx++;
          return sleep((step.charDelay || 80) / mult).then(showNext);
        }
        if (!el) return showNext();
        return Promise.resolve();
      })
      .then(function() {
        return sleep(200 / mult);
      })
      .then(function() {
        hideHud();
        clearHighlight();
      });
  }

  function doKey(step, mult) {
    var labels = [step.key || 'Enter'];
    if (step.label) labels = [step.label];
    showHudLabels(labels);
    return sleep(800 / mult).then(hideHud);
  }

  function doMoveTo(step, mult) {
    var el = findElement(step);
    if (el) showHighlight(step);
    var rect = el ? getElementRect(el) : null;
    var target = rect ? randomPointInRect(rect) : { x: cursorX, y: cursorY };
    return animateCursorTo(target.x, target.y, mult)
      .then(function() {
        return sleep(200 / mult);
      })
      .then(function() { clearHighlight(); });
  }

  function doScroll(step, mult) {
    if (step.selector) showHighlight(step);
    scrollElement(step);
    return sleep(600 / mult).then(function() { clearHighlight(); });
  }

  function doWait(step, mult) {
    var el = findElement(step);
    if (el) {
      showHighlight(step);
      highlight.style.animation = 'none';
      highlight.style.borderColor = '#f59e0b';
      highlight.style.background = 'rgba(245,158,11,0.08)';
      return sleep(800 / mult).then(function() {
        highlight.style.borderColor = '#10b981';
        highlight.style.background = 'rgba(16,185,129,0.08)';
        clearHighlight();
      });
    }
    return sleep(500 / mult);
  }

  function doNavigate(step) {
    reply('webreel:navigate', { url: step.url });
    return sleep(500);
  }

  function doDrag(step, mult) {
    var fromEl = findElement(step.from || {});
    var toEl = findElement(step.to || {});
    var fromRect = fromEl ? getElementRect(fromEl) : null;
    var toRect = toEl ? getElementRect(toEl) : null;
    if (!fromRect || !toRect) return sleep(300);

    var fromPt = randomPointInRect(fromRect);
    var toPt = randomPointInRect(toRect);

    return animateCursorTo(fromPt.x, fromPt.y, mult)
      .then(function() {
        cursorDown();
        return sleep(200 / mult);
      })
      .then(function() {
        return animateCursorTo(toPt.x, toPt.y, mult * 0.7);
      })
      .then(function() {
        cursorUp();
        return sleep(100 / mult);
      });
  }

  function doSelect(step, mult) {
    var el = findElement(step);
    if (el) showHighlight(step);
    var rect = el ? getElementRect(el) : null;
    var target = rect ? randomPointInRect(rect) : { x: cursorX, y: cursorY };
    return animateCursorTo(target.x, target.y, mult)
      .then(function() {
        cursorDown();
        return sleep(100 / mult);
      })
      .then(function() {
        cursorUp();
        return sleep(200 / mult);
      })
      .then(function() { clearHighlight(); });
  }

  // ─── Element picker ────────────────────────────────────────────────────────

  var pickOverlay = document.createElement('div');
  pickOverlay.id = '__wr-pick-overlay';
  pickOverlay.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;border:2px solid #3b82f6;border-radius:3px;background:rgba(59,130,246,0.08);transition:all 60ms ease;display:none;';
  document.documentElement.appendChild(pickOverlay);

  var pickTooltip = document.createElement('div');
  pickTooltip.id = '__wr-pick-tooltip';
  pickTooltip.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;background:#1e1e1e;color:#e5e5e5;font:11px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;padding:3px 7px;border-radius:4px;white-space:nowrap;display:none;max-width:400px;overflow:hidden;text-overflow:ellipsis;';
  document.documentElement.appendChild(pickTooltip);

  var pickActive = false;
  var pickCurrent = null;

  function getSelector(el) {
    if (el.id) return '#' + CSS.escape(el.id);
    if (el.getAttribute && el.getAttribute('data-testid')) return '[data-testid="' + el.getAttribute('data-testid') + '"]';

    var tag = el.tagName.toLowerCase();
    if (tag === 'html' || tag === 'body') return tag;

    var classes = Array.from(el.classList).filter(function(c) {
      return !c.startsWith('__wr');
    });
    var candidate = classes.length > 0 ? tag + '.' + classes.map(function(c){ return CSS.escape(c); }).join('.') : '';
    if (candidate) {
      try {
        var matches = document.querySelectorAll(candidate);
        if (matches.length === 1) return candidate;
      } catch(e) {}
    }

    var parts = [];
    var node = el;
    while (node && node !== document.body && parts.length < 5) {
      var s = node.tagName.toLowerCase();
      if (node.id) { parts.unshift('#' + CSS.escape(node.id)); break; }
      var nc = Array.from(node.classList).filter(function(c) { return !c.startsWith('__wr'); });
      if (nc.length > 0) s += '.' + nc.slice(0, 2).map(function(c){ return CSS.escape(c); }).join('.');
      var parent = node.parentElement;
      if (parent) {
        var siblings = Array.from(parent.children).filter(function(c) { return c.tagName === node.tagName; });
        if (siblings.length > 1) s += ':nth-child(' + (Array.from(parent.children).indexOf(node) + 1) + ')';
      }
      parts.unshift(s);
      node = parent;
    }
    return parts.join(' > ');
  }

  function onPickMove(e) {
    var el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el.id === '__wr-pick-overlay' || el.id === '__wr-pick-tooltip') return;
    pickCurrent = el;
    var rect = el.getBoundingClientRect();
    pickOverlay.style.left = rect.left + 'px';
    pickOverlay.style.top = rect.top + 'px';
    pickOverlay.style.width = rect.width + 'px';
    pickOverlay.style.height = rect.height + 'px';
    pickOverlay.style.display = 'block';
    var sel = getSelector(el);
    pickTooltip.textContent = sel;
    pickTooltip.style.display = 'block';
    var tx = rect.left;
    var ty = rect.bottom + 6;
    if (ty + 24 > window.innerHeight) ty = rect.top - 28;
    if (tx + pickTooltip.offsetWidth > window.innerWidth) tx = window.innerWidth - pickTooltip.offsetWidth - 4;
    if (tx < 4) tx = 4;
    pickTooltip.style.left = tx + 'px';
    pickTooltip.style.top = ty + 'px';
  }

  function onPickClick(e) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    if (!pickCurrent) return;
    var sel = getSelector(pickCurrent);
    disablePick();
    reply('webreel:pick', { selector: sel });
  }

  function enablePick() {
    if (pickActive) return;
    pickActive = true;
    cursor.style.display = 'none';
    document.addEventListener('mousemove', onPickMove, true);
    document.addEventListener('click', onPickClick, true);
  }

  function disablePick() {
    if (!pickActive) return;
    pickActive = false;
    document.removeEventListener('mousemove', onPickMove, true);
    document.removeEventListener('click', onPickClick, true);
    pickOverlay.style.display = 'none';
    pickTooltip.style.display = 'none';
    pickCurrent = null;
  }

  // ─── PostMessage protocol ─────────────────────────────────────────────────

  function reply(type, payload) {
    window.parent.postMessage({ type: type, payload: payload }, '*');
  }

  window.addEventListener('message', function(e) {
    if (!e.data || typeof e.data.type !== 'string') return;
    var type = e.data.type;
    var p = e.data.payload || {};

    switch (type) {
      case 'webreel:init':
        if (p.cursor) Object.assign(config.cursor, p.cursor);
        if (p.hud) Object.assign(config.hud, p.hud);
        if (p.viewport) Object.assign(config.viewport, p.viewport);
        if (p.colorScheme) {
          document.documentElement.style.colorScheme = p.colorScheme;
        }
        updateCursorStyle();
        updateHudStyle();
        cursor.style.display = '';
        setCursorPos(cursorX, cursorY);
        break;

      case 'webreel:colorScheme':
        if (p.value) {
          document.documentElement.style.colorScheme = p.value;
        }
        break;

      case 'webreel:highlight':
        showHighlight(p);
        break;

      case 'webreel:highlight:clear':
        clearHighlight();
        break;

      case 'webreel:moveCursor':
        animateCursorTo(p.x, p.y, p.speed || 1).then(function() {
          reply('webreel:cursor:done', {});
        });
        break;

      case 'webreel:cursorDown':
        cursorDown();
        break;

      case 'webreel:cursorUp':
        cursorUp();
        break;

      case 'webreel:showHud':
        showHudLabels(p.labels || []);
        break;

      case 'webreel:hideHud':
        hideHud();
        break;

      case 'webreel:scroll':
        scrollElement(p);
        break;

      case 'webreel:reset':
        clearHighlight();
        hideHud();
        hideProgress();
        setCursorPos(-40, -40);
        aborted = false;
        break;

      case 'webreel:showCursor':
        cursor.style.display = '';
        break;

      case 'webreel:hideCursor':
        cursor.style.display = 'none';
        break;

      case 'webreel:simulate:step':
        simulateStep(p.step, p.index || 0, p.total || 1, p.speed || 1).then(function() {
          reply('webreel:step:done', { index: p.index });
        });
        break;

      case 'webreel:simulate:run':
        aborted = false;
        var steps = p.steps || [];
        var speed = p.speed || 1;
        var startIdx = p.startIndex || 0;
        (function runFrom(i) {
          if (i >= steps.length || aborted) {
            hideProgress();
            clearHighlight();
            reply('webreel:simulate:complete', { stoppedAt: i });
            return;
          }
          reply('webreel:simulate:progress', { index: i });
          simulateStep(steps[i], i, steps.length, speed).then(function() {
            runFrom(i + 1);
          });
        })(startIdx);
        break;

      case 'webreel:simulate:stop':
        aborted = true;
        if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
        hideProgress();
        break;

      case 'webreel:flash':
        flash();
        break;

      case 'webreel:pick:enable':
        enablePick();
        break;

      case 'webreel:pick:disable':
        disablePick();
        break;

      case 'webreel:safeguards:enable':
        enableSafeguards();
        break;

      case 'webreel:safeguards:disable':
        disableSafeguards();
        break;

      case 'webreel:execute':
        executeStep(p.step || p).then(function(result) {
          if (!result || result.navigated !== true) {
            reply('webreel:execute:done', { index: p.index });
          }
        });
        break;
    }
  });

  // ─── Network safeguards ─────────────────────────────────────────────────

  var originalFetch = null;
  var originalXhrOpen = null;
  var safeguardsActive = false;

  function enableSafeguards() {
    if (safeguardsActive) return;
    safeguardsActive = true;
    originalFetch = window.fetch;
    window.fetch = function() {
      return Promise.resolve(new Response('', { status: 200 }));
    };
    originalXhrOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function() {};
  }

  function disableSafeguards() {
    if (!safeguardsActive) return;
    safeguardsActive = false;
    if (originalFetch) window.fetch = originalFetch;
    if (originalXhrOpen) XMLHttpRequest.prototype.open = originalXhrOpen;
    originalFetch = null;
    originalXhrOpen = null;
  }

  // ─── Step execution (real DOM, no animation) ────────────────────────────

  function waitForRaf() {
    return new Promise(function(r) { requestAnimationFrame(function() { setTimeout(r, 16); }); });
  }

  function executeStep(step) {
    if (!step) return Promise.resolve({});
    var action = step.action;

    switch (action) {
      case 'click': return execClick(step);
      case 'type': return execType(step);
      case 'key': return execKey(step);
      case 'scroll': return execScroll(step);
      case 'navigate': return execNavigate(step);
      case 'wait': return execWait(step);
      case 'select': return execSelect(step);
      case 'hover':
      case 'moveTo': return execHover(step);
      case 'drag': return execDrag(step);
      case 'pause':
      case 'screenshot':
        return Promise.resolve({});
      default:
        return Promise.resolve({});
    }
  }

  function execClick(step) {
    var el = findElement(step);
    if (!el) return waitForRaf();
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    var rect = el.getBoundingClientRect();
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;
    var opts = { bubbles: true, cancelable: true, clientX: cx, clientY: cy, button: 0 };
    if (step.modifiers && step.modifiers.length) {
      step.modifiers.forEach(function(m) {
        var key = m.toLowerCase();
        if (key === 'meta' || key === 'command' || key === 'cmd') opts.metaKey = true;
        if (key === 'ctrl' || key === 'control') opts.ctrlKey = true;
        if (key === 'shift') opts.shiftKey = true;
        if (key === 'alt' || key === 'option') opts.altKey = true;
      });
    }
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    el.dispatchEvent(new MouseEvent('mouseup', opts));
    el.dispatchEvent(new MouseEvent('click', opts));
    return waitForRaf();
  }

  function execType(step) {
    var el = findElement(step);
    if (!el) return Promise.resolve({});
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    if (el.focus) el.focus();
    var text = step.text || '';
    if ('value' in el) {
      el.value = (el.value || '') + text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (el.isContentEditable) {
      el.textContent = (el.textContent || '') + text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    return waitForRaf();
  }

  function execKey(step) {
    var keyVal = step.key || 'Enter';
    var target = step.target || step.selector
      ? findElement(step.target || step)
      : document.activeElement || document.body;
    if (target && target.focus) target.focus();
    var kOpts = { key: keyVal, code: keyVal, bubbles: true, cancelable: true };
    if (target) {
      target.dispatchEvent(new KeyboardEvent('keydown', kOpts));
      target.dispatchEvent(new KeyboardEvent('keyup', kOpts));
    }
    return waitForRaf();
  }

  function execScroll(step) {
    var target = window;
    if (step.selector) {
      var el = findBySelector(step.selector, step.within);
      if (el) target = el;
    }
    target.scrollBy({ left: step.x || 0, top: step.y || 0, behavior: 'instant' });
    return waitForRaf();
  }

  function execNavigate(step) {
    if (step.url) {
      reply('webreel:navigate', { url: step.url });
    }
    return Promise.resolve({ navigated: true });
  }

  function execWait(step) {
    var maxWait = step.timeout || 5000;
    var interval = 50;
    var elapsed = 0;
    return new Promise(function(resolve) {
      function check() {
        var found = findElement(step);
        if (found || elapsed >= maxWait) {
          resolve({});
          return;
        }
        elapsed += interval;
        setTimeout(check, interval);
      }
      check();
    });
  }

  function execSelect(step) {
    var el = findElement(step);
    if (!el) return Promise.resolve({});
    el.value = step.value || '';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return waitForRaf();
  }

  function execHover(step) {
    var el = findElement(step);
    if (!el) return Promise.resolve({});
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    var rect = el.getBoundingClientRect();
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;
    el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, clientX: cx, clientY: cy }));
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: cx, clientY: cy }));
    el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: cx, clientY: cy }));
    return waitForRaf();
  }

  function execDrag(step) {
    var fromEl = findElement(step.from || {});
    var toEl = findElement(step.to || {});
    if (!fromEl || !toEl) return Promise.resolve({});
    var fromRect = fromEl.getBoundingClientRect();
    var toRect = toEl.getBoundingClientRect();
    var fx = fromRect.left + fromRect.width / 2;
    var fy = fromRect.top + fromRect.height / 2;
    var tx = toRect.left + toRect.width / 2;
    var ty = toRect.top + toRect.height / 2;
    fromEl.dispatchEvent(new DragEvent('dragstart', { bubbles: true, clientX: fx, clientY: fy, dataTransfer: new DataTransfer() }));
    toEl.dispatchEvent(new DragEvent('dragover', { bubbles: true, clientX: tx, clientY: ty, dataTransfer: new DataTransfer() }));
    toEl.dispatchEvent(new DragEvent('drop', { bubbles: true, clientX: tx, clientY: ty, dataTransfer: new DataTransfer() }));
    fromEl.dispatchEvent(new DragEvent('dragend', { bubbles: true, clientX: tx, clientY: ty, dataTransfer: new DataTransfer() }));
    return waitForRaf();
  }

  updateCursorStyle();
  updateHudStyle();

  reply('webreel:ready', {});
})();
`;
