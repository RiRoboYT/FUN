/* StudyForge — Quests card and Forge Shop (v3.2): rendering and animations.
 * Claiming a quest flies its Ingots into the wallet in the top bar; buying an item flies
 * them out of the wallet into the item, which is stamped "Forged" with a burst of sparks. */
(function (root) {
  'use strict';

  var doc = root.document;
  var Q = root.SF.quests;
  var SH = root.SF.shop;
  var reduced = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function $(id) { return doc.getElementById(id); }
  function sound(name) { if (root.SF.sound) root.SF.sound.play(name); }
  function gs() { return reduced ? null : root.gsap; }

  function el(tag, attrs, children) {
    var n = doc.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') n.textContent = attrs[k];
      else if (k === 'class') n.className = attrs[k];
      else if (k === 'html') n.innerHTML = attrs[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) {
      if (c != null) n.appendChild(typeof c === 'string' ? doc.createTextNode(c) : c);
    });
    return n;
  }

  // ---------- Shared effects ----------
  function center(node) {
    var r = node.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  // Ingot chips arcing from one element to another. Calls done() when the last lands.
  function fly(fromNode, toNode, count, done) {
    var g = gs();
    if (!g || !fromNode || !toNode) { if (done) done(); return; }
    var a = center(fromNode), b = center(toNode);
    var left = count;
    for (var i = 0; i < count; i++) {
      var chip = el('i', { class: 'ingot-icon fly-ingot', 'aria-hidden': 'true' });
      chip.style.left = a.x + 'px';
      chip.style.top = a.y + 'px';
      doc.body.appendChild(chip);
      (function (node, k) {
        var lift = -40 - Math.random() * 50, side = (Math.random() - 0.5) * 70;
        g.timeline({ delay: k * 0.07, onComplete: function () {
          node.remove();
          if (k % 2 === 0) sound('tick');
          if (--left === 0 && done) done();
        } })
          .fromTo(node, { x: 0, y: 0, scale: 0.5, autoAlpha: 0, rotation: -20 },
            { x: side, y: lift, scale: 1.35, autoAlpha: 1, rotation: 10, duration: 0.28, ease: 'power2.out' })
          .to(node, { x: b.x - a.x, y: b.y - a.y, scale: 0.75, rotation: 0, duration: 0.5, ease: 'power3.in' })
          .to(node, { autoAlpha: 0, duration: 0.08 });
      })(chip, i);
    }
  }

  function countTo(node, from, to, duration) {
    var g = gs();
    if (!g || from === to) { node.textContent = to; return; }
    var o = { v: from };
    g.to(o, { v: to, duration: duration || 0.8, ease: 'power2.out', onUpdate: function () { node.textContent = Math.round(o.v); } });
  }

  function pop(node) {
    var g = gs();
    if (g) g.fromTo(node, { scale: 1 }, { scale: 1.08, duration: 0.14, yoyo: true, repeat: 1, ease: 'power2.out' });
  }

  // A burst of sparks from the middle of `host` (which must be positioned).
  function sparks(host, color, count) {
    var g = gs();
    if (!g) return;
    var n = count || 16;
    for (var i = 0; i < n; i++) {
      var s = el('i', { class: 'fx-spark', 'aria-hidden': 'true' });
      s.style.background = color || '#ffcf7a';
      s.style.boxShadow = '0 0 8px ' + (color || '#ffb347');
      host.appendChild(s);
      var ang = Math.random() * Math.PI * 2, dist = 40 + Math.random() * 70;
      (function (node) {
        g.fromTo(node, { x: 0, y: 0, scale: 1, autoAlpha: 1 }, {
          x: Math.cos(ang) * dist, y: Math.sin(ang) * dist * 0.75 - 20, scale: 0.2, autoAlpha: 0,
          duration: 0.6 + Math.random() * 0.4, ease: 'power3.out', onComplete: function () { node.remove(); }
        });
      })(s);
    }
  }

  function stamp(host, text) {
    var node = el('span', { class: 'fx-stamp', text: text });
    host.appendChild(node);
    var g = gs();
    if (g) {
      g.timeline({ onComplete: function () { node.remove(); } })
        .fromTo(node, { scale: 2.4, rotation: -22, autoAlpha: 0 }, { scale: 1, rotation: -8, autoAlpha: 1, duration: 0.35, ease: 'back.out(2.2)' })
        .to(node, { autoAlpha: 0, scale: 0.9, duration: 0.4, delay: 1.4 });
    } else setTimeout(function () { node.remove(); }, 1500);
  }

  function shimmer(card) {
    var f = el('span', { class: 'fx-flash', 'aria-hidden': 'true' });
    card.appendChild(f);
    var g = gs();
    if (g) g.fromTo(f, { xPercent: -120 }, { xPercent: 120, duration: 0.7, ease: 'power2.inOut', onComplete: function () { f.remove(); } });
    else f.remove();
  }

  // ---------- Quests ----------
  var lastPct = {};
  var Qctx = null;
  var questBusy = false;

  function timeLeft(ms) {
    var m = Math.max(1, Math.round(ms / 60000));
    var d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
    if (d) return d + 'd ' + h + 'h';
    if (h) return h + 'h ' + mm + 'm';
    return mm + 'm';
  }

  function progText(q) {
    if (q.unit === 'min' && q.goal >= 120) {
      return (Math.floor(q.value / 6) / 10) + ' / ' + (q.goal / 60) + ' h';
    }
    return q.value + ' / ' + q.goal + (q.unit ? ' ' + q.unit : '');
  }

  function questRow(q, slot, canReroll) {
    var stateName = q.claimed ? 'claimed' : q.done ? 'done' : 'active';
    var pct = Math.round(q.value / q.goal * 100);
    var bar = el('i', { class: 'q-fill' });
    bar.style.width = (lastPct[q.key] != null ? lastPct[q.key] : 0) + '%';
    bar.dataset.target = pct;

    var side = el('div', { class: 'q-side' }, [
      el('span', { class: 'q-reward', title: 'Reward' }, [el('i', { class: 'ingot-icon', 'aria-hidden': 'true' }), '+' + q.reward])
    ]);
    if (stateName === 'done') {
      side.appendChild(el('button', { class: 'btn btn-primary q-claim', type: 'button', 'data-key': q.key, text: 'Claim' }));
    } else if (stateName === 'active' && q.kind === 'daily' && canReroll) {
      side.appendChild(el('button', { class: 'q-reroll', type: 'button', 'data-slot': slot, title: 'Swap this quest for another (once a day)', 'aria-label': 'Swap quest', text: '↻' }));
    }

    var row = el('li', { class: 'quest', 'data-key': q.key, 'data-state': stateName }, [
      el('span', { class: 'q-icon', 'aria-hidden': 'true', text: q.icon }),
      el('div', { class: 'q-body' }, [
        el('b', { class: 'q-title', text: q.title }),
        el('div', { class: 'q-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(q.goal), 'aria-valuenow': String(q.value), 'aria-label': q.title }, [bar]),
        el('small', { class: 'q-prog', text: q.claimed ? 'Claimed' : q.done ? 'Complete!' : progText(q) })
      ]),
      side
    ]);
    return row;
  }

  function renderQuests(state, now, handlers) {
    Qctx = { state: state, h: handlers };
    if (questBusy) return;
    var data = Q.list(state, now);
    $('q-daily-reset').textContent = 'resets in ' + timeLeft(data.dailyEndsAt - now);
    $('q-weekly-reset').textContent = 'resets in ' + timeLeft(data.weeklyEndsAt - now);
    fill($('q-daily'), data.daily, data.canReroll);
    fill($('q-weekly'), data.weekly, false);
  }

  function fill(list, quests, canReroll) {
    list.textContent = '';
    quests.forEach(function (q, i) { list.appendChild(questRow(q, i, canReroll)); });
    // Bars grow from where they were last time (or from empty) to now.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        list.querySelectorAll('.q-fill').forEach(function (b) {
          b.style.width = b.dataset.target + '%';
          lastPct[b.parentNode.parentNode.parentNode.dataset.key] = +b.dataset.target;
        });
      });
    });
  }

  function onQuestClick(e) {
    if (!Qctx) return;
    var claimBtn = e.target.closest('.q-claim');
    var rerollBtn = e.target.closest('.q-reroll');
    if (claimBtn) claim(claimBtn);
    else if (rerollBtn) reroll(rerollBtn);
  }

  function claim(btn) {
    var row = btn.closest('.quest');
    var before = SH.wallet(Qctx.state);
    var got = Qctx.h.claim(btn.dataset.key);
    if (!got) return;
    questBusy = true;
    btn.disabled = true;
    var reward = row.querySelector('.q-reward');
    var top = $('top-ingots');
    sound('clang');
    shimmer(row);
    sparks(row, '#ffcf7a', 18);
    stamp(row, 'Claimed');
    row.dataset.state = 'claimed';
    row.querySelector('.q-prog').textContent = 'Claimed';
    var g = gs();
    if (g) g.to(btn, { autoAlpha: 0, scale: 0.6, duration: 0.25, onComplete: function () { btn.remove(); } });
    else btn.remove();
    fly(reward, top, Math.min(9, Math.max(4, Math.round(got / 8))), function () {
      sound('reward');
      countTo(top, before, SH.wallet(Qctx.state), 0.6);
      pop(top.parentNode);
      setTimeout(function () { questBusy = false; Qctx.h.rerender(); }, 900);
    });
  }

  function reroll(btn) {
    var row = btn.closest('.quest');
    if (!Qctx.h.reroll(+btn.dataset.slot)) return;
    questBusy = true;
    sound('whoosh');
    var slot = +btn.dataset.slot;
    var g = gs();
    var after = function () {
      questBusy = false;
      Qctx.h.rerender();
      var fresh = $('q-daily').children[slot];
      if (g && fresh) g.fromTo(fresh, { rotationX: -90, autoAlpha: 0, transformPerspective: 600 }, { rotationX: 0, autoAlpha: 1, duration: 0.45, ease: 'back.out(1.6)' });
    };
    if (g) g.to(row, { rotationX: 90, autoAlpha: 0, transformPerspective: 600, duration: 0.3, ease: 'power2.in', onComplete: after });
    else after();
  }

  // ---------- Shop ----------
  var Sctx = null;
  var tab = 'ember';
  var shownWallet = null;

  // Hand-drawn previews for each category.
  // Side view: heel on the left, horn to the right, a narrow waist and splayed feet.
  var ANVIL_PATH = 'M22 22H100L128 26Q118 30 100 33H92Q82 37 80 48L90 56L98 64H32L40 56L50 48Q48 37 36 33H26Z';
  function svg(markup, cls) { return el('div', { class: 'si-art ' + cls, html: markup }); }

  function art(item) {
    var a = item.swatch[0], b = item.swatch[1], c = item.swatch[2] || b;
    var gid = 'g-' + item.id;
    if (item.cat === 'ember') {
      var e = el('div', { class: 'si-art art-ember' }, [
        el('span', { class: 'ae-glow' }), el('span', { class: 'ae-flame f1' }), el('span', { class: 'ae-flame f2' }),
        el('span', { class: 'ae-flame f3' }), el('span', { class: 'ae-coals' }),
        el('i', { class: 'ae-spark s1' }), el('i', { class: 'ae-spark s2' }), el('i', { class: 'ae-spark s3' }), el('i', { class: 'ae-spark s4' })
      ]);
      e.style.setProperty('--a', a); e.style.setProperty('--b', b);
      return e;
    }
    if (item.cat === 'anvil') {
      return svg('<svg viewBox="0 0 140 80" aria-hidden="true"><defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0.35" y2="1">' +
        '<stop offset="0" stop-color="' + b + '"/><stop offset="0.45" stop-color="' + a + '"/><stop offset="1" stop-color="' + a + '" stop-opacity="0.85"/></linearGradient></defs>' +
        '<ellipse cx="66" cy="69" rx="46" ry="4.5" fill="#000" opacity="0.5"/>' +
        '<g transform="translate(-6 2)"><path d="' + ANVIL_PATH + '" fill="url(#' + gid + ')"/>' +
        '<path d="M23 22.6H100L126 26" fill="none" stroke="' + b + '" stroke-width="1.6" stroke-linecap="round"/>' +
        '<path d="M30 23.4H88" stroke="#fff" stroke-width="1" opacity="0.55"/>' +
        '<path d="M50 48L40 56M80 48L90 56" stroke="#000" stroke-width="1" opacity="0.25"/></g></svg>', 'art-anvil');
    }
    if (item.cat === 'hammer') {
      var glow = item.skin.glow ? ' glow' : '';
      return svg('<svg viewBox="0 0 140 80" aria-hidden="true"><defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="#fff" stop-opacity="0.55"/><stop offset="0.35" stop-color="' + a + '"/><stop offset="1" stop-color="' + a + '" stop-opacity="0.75"/></linearGradient></defs>' +
        '<ellipse cx="72" cy="72" rx="48" ry="4" fill="#000" opacity="0.4"/>' +
        '<rect x="56" y="34" width="70" height="8" rx="4" fill="' + b + '" transform="rotate(-18 56 38)"/>' +
        '<path d="M60 36l60-19" stroke="#000" stroke-width="1" opacity="0.18"/>' +
        '<rect class="hm-head" x="22" y="30" width="44" height="24" rx="5" fill="url(#' + gid + ')" transform="rotate(-18 44 42)"/></svg>', 'art-hammer' + glow);
    }
    // Workshop: a little room with its window and lamp light.
    var r = el('div', { class: 'si-art art-room' }, [
      el('span', { class: 'ar-wall' }), el('span', { class: 'ar-window' }), el('span', { class: 'ar-lamp' }),
      el('span', { class: 'ar-floor' }), el('span', { class: 'ar-anvil', html: '<svg viewBox="0 0 140 80"><path d="' + ANVIL_PATH + '"/></svg>' })
    ]);
    r.style.setProperty('--a', a); r.style.setProperty('--b', b); r.style.setProperty('--c', c);
    return r;
  }

  // ---------- Shop: rendered thumbnails and the live 3D stage ----------
  var THUMB_KEY = 'studyforge.thumbs.v3';
  var thumbs = (function () { try { return JSON.parse(root.sessionStorage.getItem(THUMB_KEY)) || {}; } catch (e) { return {}; } })();
  var selected = {};
  var stage = { api: null, failed: false, rendering: false, hover: null, timer: 0, shown: null };

  function saveThumbs() { try { root.sessionStorage.setItem(THUMB_KEY, JSON.stringify(thumbs)); } catch (e) { /* full: fine */ } }
  function catName(cat) { return SH.CATEGORIES.filter(function (c) { return c.id === cat; })[0].name; }
  function defaultSkins() {
    var k = {};
    SH.CATEGORIES.forEach(function (c) { k[c.id] = SH.itemsIn(c.id).filter(function (i) { return i.price === 0; })[0].skin; });
    return k;
  }
  function withItem(base, item) { var k = Object.assign({}, base); k[item.cat] = item.skin; return k; }

  function cardArt(item) {
    if (stage.failed) return art(item);
    var box = el('div', { class: 'si-art si-thumb' }, [el('span', { class: 'si-skel', 'aria-hidden': 'true' })]);
    if (thumbs[item.id]) {
      box.appendChild(el('img', { src: thumbs[item.id], alt: '' }));
      box.classList.add('loaded');
    }
    return box;
  }

  function setThumb(id, url) {
    thumbs[id] = url;
    var box = $('shop-grid').querySelector('.shop-item[data-id="' + id + '"] .si-thumb');
    if (!box || box.querySelector('img')) return;
    box.appendChild(el('img', { src: url, alt: '' }));
    requestAnimationFrame(function () { box.classList.add('loaded'); });
  }

  function cardState(state, item) {
    if (SH.equippedId(state, item.cat) === item.id) return 'equipped';
    if (SH.owns(state, item.id)) return 'owned';
    return SH.wallet(state) >= item.price ? 'buy' : 'short';
  }

  function priceInto(node, state, item) {
    node.textContent = '';
    if (item.price === 0) node.textContent = 'Free';
    else if (SH.owns(state, item.id)) node.textContent = 'Owned';
    else { node.appendChild(el('i', { class: 'ingot-icon', 'aria-hidden': 'true' })); node.appendChild(doc.createTextNode(String(item.price))); }
  }

  function buttonFor(btn, state, item, long) {
    var st = cardState(state, item);
    btn.classList.remove('confirm');
    btn.disabled = st === 'equipped' || st === 'short';
    btn.classList.toggle('btn-primary', st === 'buy');
    btn.textContent = st === 'equipped' ? 'Equipped ✓' : st === 'owned' ? 'Equip' :
      st === 'buy' ? (long ? 'Buy for ' + item.price : 'Buy') : 'Need ' + (item.price - SH.wallet(state)) + ' more';
    btn.dataset.id = item.id;
    return st;
  }

  function setCard(card, state, item) {
    card.dataset.state = buttonFor(card.querySelector('.si-btn'), state, item, false);
    card.classList.toggle('selected', selected[item.cat] === item.id);
    priceInto(card.querySelector('.si-price'), state, item);
  }

  function itemCard(state, item) {
    var card = el('article', { class: 'shop-item', 'data-id': item.id, tabindex: '0', 'aria-label': item.name }, [
      cardArt(item),
      el('div', { class: 'si-body' }, [el('h3', { text: item.name }), el('p', { text: item.desc })]),
      el('div', { class: 'si-foot' }, [el('span', { class: 'si-price' }), el('button', { class: 'btn si-btn', type: 'button' })])
    ]);
    setCard(card, state, item);
    return card;
  }

  function renderWallet(state, animate) {
    var w = SH.wallet(state);
    var node = $('wallet-val');
    if (animate && shownWallet != null && shownWallet !== w) countTo(node, shownWallet, w, 0.8);
    else node.textContent = w;
    shownWallet = w;
    $('wallet-sub').textContent = state.totalIngots.toLocaleString() + ' forged · ' + ((state.shop && state.shop.spent) || 0).toLocaleString() + ' spent';
  }

  function renderTabs(state) {
    var host = $('shop-tabs');
    host.textContent = '';
    SH.CATEGORIES.forEach(function (c) {
      var items = SH.itemsIn(c.id);
      var owned = items.filter(function (i) { return SH.owns(state, i.id); }).length;
      host.appendChild(el('button', {
        class: 'shop-tab', role: 'tab', type: 'button', 'data-cat': c.id, 'aria-selected': String(c.id === tab)
      }, [el('b', { text: c.name }), el('small', { text: owned + ' / ' + items.length + ' owned' })]));
    });
  }

  function renderGrid(state, animate) {
    var cat = SH.CATEGORIES.filter(function (c) { return c.id === tab; })[0];
    $('shop-blurb').textContent = cat.blurb + ' Hover an item to try it on above.';
    var grid = $('shop-grid');
    grid.textContent = '';
    SH.itemsIn(tab).forEach(function (item) { grid.appendChild(itemCard(state, item)); });
    var g = gs();
    if (g && animate) g.from(grid.children, { y: 22, autoAlpha: 0, duration: 0.5, stagger: 0.06, ease: 'power3.out', clearProps: 'transform,opacity,visibility' });
  }

  // ---- The stage ----
  function stageItem() { return SH.item(stage.hover || selected[tab] || SH.equippedId(Sctx.state, tab)); }

  function renderStageInfo() {
    var item = stageItem();
    var trying = stage.hover && stage.hover !== selected[tab];
    $('stage-eyebrow').textContent = (trying ? 'Trying on · ' : '') + catName(item.cat);
    $('stage-name').textContent = item.name;
    $('stage-desc').textContent = item.desc;
    priceInto($('stage-price'), Sctx.state, item);
    buttonFor($('stage-btn'), Sctx.state, item, true);
    if (stage.shown !== item.id) {
      stage.shown = item.id;
      var g = gs();
      if (g) g.fromTo('#stage-info > *', { y: 10, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.4, stagger: 0.04, ease: 'power3.out', overwrite: true });
    }
  }

  function stagePreview() {
    if (!stage.api || stage.rendering) return;
    stage.api.preview(tab, withItem(SH.skins(Sctx.state), stageItem()));
  }

  function loader(text, f) {
    var box = $('stage-loader');
    if (text == null) {
      var g = gs();
      if (g) g.to(box, { autoAlpha: 0, duration: 0.6, ease: 'power2.out', onComplete: function () { box.hidden = true; } });
      else box.hidden = true;
      return;
    }
    box.hidden = false;
    if (gs()) gs().set(box, { autoAlpha: 1 });
    $('stage-loader-text').textContent = text;
    $('stage-loader-fill').style.width = Math.round((f || 0) * 100) + '%';
  }

  function openStage() {
    if (stage.failed) return;
    var host = $('shop-stage');
    if (!stage.api) loader('Lighting the showroom', 0.15);
    root.SF.forge.withForge(function (api) {
      if (!api) {
        stage.failed = true;
        host.classList.add('no3d');
        loader(null);
        renderGrid(Sctx.state, false);
        return;
      }
      if ($('view-shop').hidden) return;
      stage.api = api;
      api.showroom(host, tab, withItem(SH.skins(Sctx.state), stageItem()));
      host.classList.add('live');
      renderThumbs();
    });
  }

  // Each card's picture is the real forge, rendered with that one item.
  function renderThumbs() {
    var order = [tab].concat(SH.CATEGORIES.map(function (c) { return c.id; }).filter(function (c) { return c !== tab; }));
    var base = defaultSkins(), jobs = [];
    order.forEach(function (cat) {
      SH.itemsIn(cat).forEach(function (item) {
        if (!thumbs[item.id]) jobs.push({ id: item.id, cat: cat, skins: withItem(base, item) });
      });
    });
    if (!jobs.length) { loader(null); return; }
    stage.rendering = true;
    var done = 0;
    loader('Polishing the displays', 0.2);
    stage.api.thumbnails(jobs, 560, 340, function (id, url) {
      setThumb(id, url);
      done++;
      loader('Polishing the displays · ' + done + ' / ' + jobs.length, 0.2 + 0.8 * done / jobs.length);
    }).then(function () {
      stage.rendering = false;
      saveThumbs();
      stagePreview();
      loader(null);
    });
  }

  function renderShop(state, handlers) {
    var first = !Sctx;
    Sctx = { state: state, h: handlers };
    if (!selected[tab]) selected[tab] = SH.equippedId(state, tab);
    renderWallet(state, !first);
    renderTabs(state);
    renderGrid(state, true);
    stage.hover = null;
    renderStageInfo();
    openStage();
  }

  function refreshCards() {
    $('shop-grid').querySelectorAll('.shop-item').forEach(function (card) {
      setCard(card, Sctx.state, SH.item(card.dataset.id));
    });
    renderTabs(Sctx.state);
    renderStageInfo();
  }

  function hover(id) {
    clearTimeout(stage.timer);
    stage.timer = setTimeout(function () {
      if (stage.hover === id) return;
      stage.hover = id;
      renderStageInfo();
      stagePreview();
    }, id ? 70 : 220);
  }

  function select(id) {
    selected[tab] = id;
    stage.hover = null;
    sound('tick');
    refreshCards();
    stagePreview();
  }

  function onShopClick(e) {
    if (!Sctx) return;
    var t = e.target.closest('.shop-tab');
    if (t) {
      if (t.dataset.cat === tab) return;
      tab = t.dataset.cat;
      if (!selected[tab]) selected[tab] = SH.equippedId(Sctx.state, tab);
      stage.hover = null;
      sound('whoosh');
      renderTabs(Sctx.state);
      renderGrid(Sctx.state, true);
      renderStageInfo();
      stagePreview();
      return;
    }
    var btn = e.target.closest('.si-btn, #stage-btn');
    var card = e.target.closest('.shop-item');
    if (!btn) { if (card) select(card.dataset.id); return; }
    if (btn.disabled) return;
    var item = SH.item(btn.dataset.id);
    var st = cardState(Sctx.state, item);
    if (st === 'owned') return equip(item);
    if (st !== 'buy') return;
    // Two clicks to buy: the first asks for confirmation.
    if (!btn.classList.contains('confirm')) {
      btn.classList.add('confirm');
      btn.textContent = 'Confirm · ' + item.price;
      clearTimeout(btn._t);
      btn._t = setTimeout(function () { if (btn.isConnected) refreshCards(); }, 3500);
      return;
    }
    clearTimeout(btn._t);
    buy(item, btn);
  }

  function cardOf(id) { return $('shop-grid').querySelector('.shop-item[data-id="' + id + '"]'); }

  // The stage flares up as a new item is forged into it.
  function stageFlare(item) {
    var host = $('shop-stage');
    var f = el('span', { class: 'stage-flare', 'aria-hidden': 'true' });
    f.style.setProperty('--flare', item.swatch[1]);
    host.appendChild(f);
    var g = gs();
    if (g) g.fromTo(f, { autoAlpha: 0, scale: 0.4 }, { autoAlpha: 1, scale: 1.4, duration: 0.35, ease: 'power2.out', yoyo: true, repeat: 1, onComplete: function () { f.remove(); } });
    else f.remove();
    sparks(host, item.swatch[1], 30);
    stamp($('stage-info'), 'Forged!');
  }

  function buy(item, btn) {
    var before = SH.wallet(Sctx.state);
    var r = Sctx.h.buy(item.id);
    if (!r.ok) { refreshCards(); return; }
    btn.disabled = true;
    btn.textContent = 'Forging…';
    selected[item.cat] = item.id;
    stage.hover = null;
    var walletNode = $('wallet-val');
    countTo(walletNode, before, SH.wallet(Sctx.state), 0.9);
    shownWallet = SH.wallet(Sctx.state);
    var card = cardOf(item.id);
    var target = btn.id === 'stage-btn' || !card ? $('stage-name') : card.querySelector('.si-art');
    fly(walletNode, target, Math.min(10, Math.max(4, Math.round(item.price / 30))), function () {
      sound('clang');
      setTimeout(function () { sound('reward'); }, 160);
      stageFlare(item);
      if (card) { shimmer(card); sparks(card.querySelector('.si-art'), item.swatch[1], 18); pop(card); }
      refreshCards();
      renderWallet(Sctx.state, false);
      stagePreview();
      $('top-ingots').textContent = SH.wallet(Sctx.state);
    });
  }

  function equip(item) {
    if (!Sctx.h.equip(item.id)) return;
    selected[item.cat] = item.id;
    stage.hover = null;
    sound('clang');
    var card = cardOf(item.id);
    refreshCards();
    stagePreview();
    if (card) {
      shimmer(card);
      sparks(card.querySelector('.si-art'), item.swatch[1], 12);
      var g = gs();
      if (g) g.fromTo(card, { scale: 0.97 }, { scale: 1, duration: 0.45, ease: 'back.out(3)' });
    }
  }

  doc.addEventListener('pointerover', function (e) {
    if (!Sctx || stage.failed) return;
    var card = e.target.closest && e.target.closest('#shop-grid .shop-item');
    if (card) hover(card.dataset.id);
    else if (stage.hover && !e.target.closest('#shop-grid')) hover(null);
  });
  doc.addEventListener('keydown', function (e) {
    var card = e.target.closest && e.target.closest('#shop-grid .shop-item');
    if (card && (e.key === 'Enter' || e.key === ' ') && e.target === card) { e.preventDefault(); select(card.dataset.id); }
  });
  doc.addEventListener('focusin', function (e) {
    var card = e.target.closest && e.target.closest('#shop-grid .shop-item');
    if (card && Sctx && !stage.failed) hover(card.dataset.id);
  });

  doc.addEventListener('click', function (e) {
    if (e.target.closest('#quests-card')) onQuestClick(e);
    else if (e.target.closest('#view-shop')) onShopClick(e);
  });

  root.SF.shopUI = { renderQuests: renderQuests, renderShop: renderShop };
})(window);
