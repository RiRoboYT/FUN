/* StudyForge v2 — interactive cursor, magnetic buttons, hover glow, click sparks, hanging spider.
   Purely visual: nothing here touches session state. */
(function (root) {
  'use strict';

  var doc = root.document;
  var html = doc.documentElement;

  var finePointer = root.matchMedia && root.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var reducedMotion = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Things the ring wraps around, and the smaller subset that leans toward the cursor.
  var TARGETS = 'button, a[href], select, summary, label.toggle, .subject, .mode-tab, .cat, .preset, .chip, [data-cursor]';
  var MAGNETIC = '.dock-btn, .preset, .btn:not(.btn-big), .radio-btn, .chip';
  var TEXT = 'input[type="text"], input[type="number"], textarea';
  var GLOW = '.btn, .card, .subject, .mode-tab, .cat, .preset, .dock-btn, .ach, .alloy-card, .counter';

  var RING_SIZE = 34;
  var RING_PAD = 6;
  var MAGNET_STRENGTH = 0.28;
  var MAGNET_MAX = 8;

  var opts = { cursor: true, spider: true };

  // ---------- Cursor ----------
  var layer = doc.getElementById('cursor');
  var dot = doc.getElementById('cursor-dot');
  var ring = doc.getElementById('cursor-ring');

  var mouse = { x: -100, y: -100, seen: false };
  // Ring geometry is eased toward a target every frame: x/y are its top-left corner.
  var r = { x: -100, y: -100, w: RING_SIZE, h: RING_SIZE, rad: RING_SIZE / 2 };
  var target = null;
  var magnetEl = null;
  var pressed = false;
  var rafId = 0;
  var wakeFrames = 0;   // keep animating a little after any input, to follow CSS transitions

  function cursorOn() { return opts.cursor && finePointer; }

  function lerp(a, b, t) { return a + (b - a) * t; }

  function radiusOf(el, rect) {
    var br = parseFloat(root.getComputedStyle(el).borderTopLeftRadius) || 0;
    return Math.min(br + RING_PAD, Math.min(rect.width, rect.height) / 2 + RING_PAD);
  }

  // Modal dialogs live in the browser's top layer; the cursor must be inside the
  // top-most one or it would be drawn underneath it.
  function placeLayer() {
    var open = doc.querySelectorAll('dialog[open]');
    var host = open.length ? open[open.length - 1] : doc.body;
    if (layer.parentNode !== host) host.appendChild(layer);
  }

  function frame() {
    rafId = 0;
    placeLayer();

    var tx, ty, tw, th, trad, ease;
    var rect = target && doc.contains(target) ? target.getBoundingClientRect() : null;
    if (rect && rect.width && rect.height) {
      tw = rect.width + RING_PAD * 2;
      th = rect.height + RING_PAD * 2;
      tx = rect.left - RING_PAD;
      ty = rect.top - RING_PAD;
      trad = radiusOf(target, rect);
      ease = 0.22;
    } else {
      var size = pressed ? RING_SIZE * 0.7 : RING_SIZE;
      tw = th = size;
      tx = mouse.x - size / 2;
      ty = mouse.y - size / 2;
      trad = size / 2;
      ease = 0.16;
    }

    r.x = lerp(r.x, tx, ease);
    r.y = lerp(r.y, ty, ease);
    r.w = lerp(r.w, tw, 0.2);
    r.h = lerp(r.h, th, 0.2);
    r.rad = lerp(r.rad, trad, 0.2);

    // Stretch the free-floating ring a little in the direction it is travelling.
    var stretch = '';
    if (!target) {
      var vx = tx - r.x, vy = ty - r.y;
      var speed = Math.min(Math.sqrt(vx * vx + vy * vy) / 60, 0.35);
      if (speed > 0.02) {
        var angle = Math.atan2(vy, vx) * 180 / Math.PI;
        stretch = ' rotate(' + angle + 'deg) scale(' + (1 + speed) + ',' + (1 - speed * 0.6) + ') rotate(' + (-angle) + 'deg)';
      }
    }

    ring.style.width = r.w + 'px';
    ring.style.height = r.h + 'px';
    ring.style.borderRadius = r.rad + 'px';
    ring.style.transform = 'translate3d(' + r.x + 'px,' + r.y + 'px,0)' + stretch;
    dot.style.transform = 'translate3d(' + mouse.x + 'px,' + mouse.y + 'px,0)' + (pressed ? ' scale(0.6)' : '');

    var settled = Math.abs(r.x - tx) < 0.3 && Math.abs(r.y - ty) < 0.3 &&
      Math.abs(r.w - tw) < 0.3 && Math.abs(r.h - th) < 0.3;
    if (wakeFrames > 0) wakeFrames--;
    if (!settled || wakeFrames > 0) loop();
  }

  function loop() {
    if (!rafId) rafId = root.requestAnimationFrame(frame);
  }

  // ~0.6 s of frames covers the dock's label transition after a hover change.
  function kick() {
    wakeFrames = 36;
    loop();
  }

  function setMagnet(el, x, y) {
    if (magnetEl && magnetEl !== el) {
      magnetEl.style.removeProperty('--mx');
      magnetEl.style.removeProperty('--my');
    }
    magnetEl = el;
    if (!el) return;
    var rect = el.getBoundingClientRect();
    var dx = (x - (rect.left + rect.width / 2)) * MAGNET_STRENGTH;
    var dy = (y - (rect.top + rect.height / 2)) * MAGNET_STRENGTH;
    dx = Math.max(-MAGNET_MAX, Math.min(MAGNET_MAX, dx));
    dy = Math.max(-MAGNET_MAX, Math.min(MAGNET_MAX, dy));
    el.style.setProperty('--mx', dx.toFixed(1) + 'px');
    el.style.setProperty('--my', dy.toFixed(1) + 'px');
  }

  function onMove(e) {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    if (!mouse.seen) {
      mouse.seen = true;
      r.x = mouse.x - RING_SIZE / 2;
      r.y = mouse.y - RING_SIZE / 2;
    }
    layer.classList.remove('away');

    var el = e.target instanceof Element ? e.target : null;
    var onText = !!(el && el.closest(TEXT));
    layer.classList.toggle('on-text', onText);

    var t = el && !onText ? el.closest(TARGETS) : null;
    if (t && (t.disabled || t.closest('.radio-goo'))) t = null;
    target = t;
    layer.classList.toggle('on-target', !!t);

    var m = !reducedMotion && el ? el.closest(MAGNETIC) : null;
    if (m && m.disabled) m = null;
    setMagnet(m, e.clientX, e.clientY);

    var g = el ? el.closest(GLOW) : null;
    if (g) {
      var rect = g.getBoundingClientRect();
      g.style.setProperty('--gx', (e.clientX - rect.left) + 'px');
      g.style.setProperty('--gy', (e.clientY - rect.top) + 'px');
    }

    if (cursorOn()) kick();
  }

  function onDown(e) {
    pressed = true;
    layer.classList.add('pressed');
    kick();
    if (cursorOn() && !reducedMotion && e.button === 0) sparks(e.clientX, e.clientY);
  }

  function onUp() {
    pressed = false;
    layer.classList.remove('pressed');
    kick();
  }

  function onLeave(e) {
    if (!e.relatedTarget) {
      layer.classList.add('away');
      setMagnet(null);
    }
  }

  // ---------- Click sparks ----------
  function sparks(x, y) {
    var count = 9;
    for (var i = 0; i < count; i++) {
      var s = doc.createElement('i');
      s.className = 'spark';
      var angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      var dist = 18 + Math.random() * 22;
      s.style.left = x + 'px';
      s.style.top = y + 'px';
      s.style.setProperty('--sx', (Math.cos(angle) * dist).toFixed(1) + 'px');
      s.style.setProperty('--sy', (Math.sin(angle) * dist + 6).toFixed(1) + 'px');
      layer.appendChild(s);
      s.addEventListener('animationend', function () { this.remove(); });
    }
  }

  // ---------- Spider ----------
  var spider = {
    svg: doc.getElementById('spider'),
    thread: doc.getElementById('spider-thread'),
    body: doc.getElementById('spider-body'),
    angle: 0.15, vel: 0, len: 230, baseLen: 230, t: 0, last: 0, raf: 0
  };

  function spiderVisible() {
    return opts.spider && !reducedMotion && !doc.body.classList.contains('in-session');
  }

  // Hang in the empty margin left of the content column when there is one.
  function spiderAnchorX() {
    var main = doc.querySelector('main .view:not([hidden])');
    var left = main ? main.getBoundingClientRect().left : 0;
    return Math.round(left > 90 ? left / 2 : Math.max(40, root.innerWidth * 0.06));
  }

  function spiderFrame(now) {
    spider.raf = 0;
    if (!spiderVisible()) { spider.svg.toggleAttribute('hidden', true); return; }
    spider.svg.toggleAttribute('hidden', false);
    var dt = Math.min(0.05, (now - (spider.last || now)) / 1000) || 0.016;
    spider.last = now;
    spider.t += dt;

    var ax = spiderAnchorX();
    var sx = ax + Math.sin(spider.angle) * spider.len;
    var sy = Math.cos(spider.angle) * spider.len;

    // It leans toward the cursor and climbs away when the cursor gets close.
    var dx = mouse.x - sx, dy = mouse.y - sy;
    var near = mouse.seen && Math.sqrt(dx * dx + dy * dy) < 90;
    var lean = mouse.seen && Math.abs(mouse.x - ax) < 420 ? Math.max(-0.45, Math.min(0.45, (mouse.x - ax) / 900)) : 0;
    var targetLen = near ? 45 : spider.baseLen + Math.sin(spider.t * 0.9) * 10;
    spider.len = lerp(spider.len, targetLen, near ? 0.09 : 0.02);
    spider.svg.classList.toggle('climbing', Math.abs(spider.len - targetLen) > 4);

    var gravity = 9.8 / (spider.len / 60);
    var acc = -gravity * Math.sin(spider.angle) + 2.2 * (lean - spider.angle) - 1.4 * spider.vel;
    spider.vel += acc * dt;
    spider.angle += spider.vel * dt;

    sx = ax + Math.sin(spider.angle) * spider.len;
    sy = Math.cos(spider.angle) * spider.len;
    spider.thread.setAttribute('x1', ax);
    spider.thread.setAttribute('x2', sx.toFixed(1));
    spider.thread.setAttribute('y2', (sy - 8).toFixed(1));
    spider.body.setAttribute('transform', 'translate(' + sx.toFixed(1) + ' ' + sy.toFixed(1) + ') rotate(' + (-spider.angle * 57.3).toFixed(1) + ')');

    spider.raf = root.requestAnimationFrame(spiderFrame);
  }

  function startSpider() {
    if (!spider.raf && spiderVisible()) {
      spider.last = 0;
      spider.raf = root.requestAnimationFrame(spiderFrame);
    } else if (!spiderVisible()) {
      spider.svg.toggleAttribute('hidden', true);
    }
  }

  // ---------- Public ----------
  function configure(next) {
    if (next) Object.keys(next).forEach(function (k) { opts[k] = !!next[k]; });
    html.classList.toggle('fx-cursor', cursorOn());
    html.classList.toggle('fx-glow', finePointer);
    if (!cursorOn()) setMagnet(null);
    startSpider();
  }

  doc.addEventListener('mousemove', onMove, { passive: true });
  doc.addEventListener('mousedown', onDown);
  doc.addEventListener('mouseup', onUp);
  doc.addEventListener('mouseout', onLeave);
  root.addEventListener('blur', onUp);
  root.addEventListener('scroll', function () { if (cursorOn() && target) kick(); }, { passive: true });
  spider.body.addEventListener('click', function () { spider.vel += (Math.random() > 0.5 ? 1 : -1) * 2.5; });

  // Follow dialogs into the top layer the moment they open or close.
  new MutationObserver(placeLayer).observe(doc.body, { attributes: true, attributeFilter: ['open'], subtree: true });

  // Spider shows/hides as views change (body.in-session toggles).
  new MutationObserver(startSpider).observe(doc.body, { attributes: true, attributeFilter: ['class'] });
  root.addEventListener('resize', startSpider);

  root.SF = root.SF || {};
  root.SF.fx = { configure: configure };
})(window);
