/* StudyForge — Forge Shop catalogue and wallet (v3.2).
 * Ingots earned count toward alloys forever; spending comes out of a separate wallet
 * (earned − spent), so buying never sets your forge back. Each category has a free
 * default. `skin` is what the 3D forge applies. Pure functions; also loads in Node. */
(function (root) {
  'use strict';

  var CATEGORIES = [
    { id: 'ember', name: 'Embers', blurb: 'The colour of your coals, flames and sparks.' },
    { id: 'anvil', name: 'Anvils', blurb: 'The finish of the anvil you forge on.' },
    { id: 'hammer', name: 'Hammers', blurb: 'The hammer that strikes each ingot you earn.' },
    { id: 'room', name: 'Workshops', blurb: 'The light and mood of your forge room.' }
  ];

  var ITEMS = [
    // Embers: `hot` is the linear RGB the coals and flames burn with.
    { id: 'ember_classic', cat: 'ember', name: 'Forge Orange', price: 0, desc: 'The classic charcoal glow.',
      swatch: ['#ff7a1f', '#ffb347'], skin: { hot: [1, 0.38, 0.07] } },
    { id: 'ember_crimson', cat: 'ember', name: 'Crimson', price: 120, desc: 'Deep red coals, like a dragon\'s breath.',
      swatch: ['#ff2a1a', '#ff7a5a'], skin: { hot: [1, 0.1, 0.06] } },
    { id: 'ember_blue', cat: 'ember', name: 'Blue Flame', price: 140, desc: 'A gas-forge blue, hot and clean.',
      swatch: ['#2f7bff', '#9ad0ff'], skin: { hot: [0.2, 0.5, 1] } },
    { id: 'ember_green', cat: 'ember', name: 'Copper Green', price: 170, desc: 'Copper salts burn an eerie green.',
      swatch: ['#1fd36b', '#b6ffcf'], skin: { hot: [0.18, 0.95, 0.4] } },
    { id: 'ember_violet', cat: 'ember', name: 'Arcane Violet', price: 220, desc: 'For a smith who dabbles in alchemy.',
      swatch: ['#9b4dff', '#e0b8ff'], skin: { hot: [0.62, 0.25, 1] } },
    { id: 'ember_gold', cat: 'ember', name: 'White Gold', price: 280, desc: 'Coals so hot they burn pale gold.',
      swatch: ['#ffcf5a', '#fff4d6'], skin: { hot: [1, 0.76, 0.32] } },

    { id: 'anvil_iron', cat: 'anvil', name: 'Black Iron', price: 0, desc: 'Cast iron, worn smooth on top.',
      swatch: ['#2c2c30', '#8a8a90'], skin: { color: 0x2c2c30, metalness: 0.95, roughness: 0.42, clearcoat: 0.2, face: 0x8a8a90 } },
    { id: 'anvil_steel', cat: 'anvil', name: 'Polished Steel', price: 110, desc: 'Mirror-bright tool steel.',
      swatch: ['#7d838c', '#e4e8ee'], skin: { color: 0x8a8f98, metalness: 1, roughness: 0.16, clearcoat: 0.6, face: 0xdfe3ea } },
    { id: 'anvil_bronze', cat: 'anvil', name: 'Bronze', price: 160, desc: 'A temple anvil in warm bronze.',
      swatch: ['#7a4b22', '#d29a5e'], skin: { color: 0x8a5a2b, metalness: 1, roughness: 0.3, clearcoat: 0.3, face: 0xd29a5e } },
    { id: 'anvil_obsidian', cat: 'anvil', name: 'Obsidian', price: 230, desc: 'Volcanic glass, black and glossy.',
      swatch: ['#06060a', '#3a3a48'], skin: { color: 0x0b0b10, metalness: 0.3, roughness: 0.06, clearcoat: 1, face: 0x2c2c38 } },
    { id: 'anvil_gold', cat: 'anvil', name: 'Gold Leaf', price: 320, desc: 'Gilded, for a master of the craft.',
      swatch: ['#d9a521', '#fff0b0'], skin: { color: 0xc9971f, metalness: 1, roughness: 0.22, clearcoat: 0.5, face: 0xffd96b } },

    { id: 'hammer_oak', cat: 'hammer', name: 'Oak & Iron', price: 0, desc: 'A trusty iron head on an oak handle.',
      swatch: ['#3b3b40', '#a5774a'], skin: { head: 0x3b3b40, handle: 0xffffff, glow: 0 } },
    { id: 'hammer_ebony', cat: 'hammer', name: 'Ebony & Steel', price: 90, desc: 'Bright steel on a dark ebony grip.',
      swatch: ['#a9afb8', '#3a2a22'], skin: { head: 0x9aa0a8, handle: 0x4a3426, glow: 0 } },
    { id: 'hammer_copper', cat: 'hammer', name: 'Copper Head', price: 130, desc: 'Soft copper that rings when it strikes.',
      swatch: ['#c0703f', '#e7c39a'], skin: { head: 0xb8643a, handle: 0xe9c79a, glow: 0 } },
    { id: 'hammer_gold', cat: 'hammer', name: 'Golden Hammer', price: 260, desc: 'Heavy, gleaming and a little showy.',
      swatch: ['#d4a52a', '#6a2e22'], skin: { head: 0xd4a52a, handle: 0x7a3a2a, glow: 0 } },
    { id: 'hammer_mythril', cat: 'hammer', name: 'Mythril Hammer', price: 420, desc: 'Light as a feather; its head glows blue.',
      swatch: ['#9fd4ff', '#2a3550'], skin: { head: 0xa8d8ff, handle: 0x3a4a70, glow: 0x2a7cff } },

    // Workshops: window + room light colours, a tint for the ambient and walls, fog colour.
    { id: 'room_classic', cat: 'room', name: 'Village Forge', price: 0, desc: 'Brick walls, a cool window, warm lamps.',
      swatch: ['#1b120d', '#9fb4ff', '#ffdcb8'],
      skin: { window: 0x9fb4ff, windowMul: 1, room: 0xffdcb8, tint: [1, 1, 1], wall: 0xffffff, fog: 0x070606 } },
    { id: 'room_night', cat: 'room', name: 'Moonlit Night', price: 150, desc: 'Silver moonlight through the window.',
      swatch: ['#080b16', '#6f8cff', '#b8c8ff'],
      skin: { window: 0x7090ff, windowMul: 1.8, room: 0xb4c4ff, tint: [0.78, 0.86, 1.15], wall: 0xb0bedc, fog: 0x05070c } },
    { id: 'room_golden', cat: 'room', name: 'Golden Hour', price: 150, desc: 'Late sun pouring in, everything glows.',
      swatch: ['#1f1208', '#ffa060', '#ffd0a0'],
      skin: { window: 0xffa050, windowMul: 2, room: 0xffc890, tint: [1.15, 0.96, 0.8], wall: 0xffe2c4, fog: 0x0c0704 } },
    { id: 'room_frost', cat: 'room', name: 'Frost Forge', price: 210, desc: 'A mountain smithy on a snowy morning.',
      swatch: ['#0e141a', '#dff0ff', '#eaf4ff'],
      skin: { window: 0xe4f2ff, windowMul: 2.2, room: 0xeaf4ff, tint: [0.96, 1.04, 1.15], wall: 0xd8e4f2, fog: 0x0a0d10 } },
    { id: 'room_cave', cat: 'room', name: 'Ember Cave', price: 240, desc: 'Carved into a volcano, lit by magma.',
      swatch: ['#1a0604', '#ff5030', '#ff9a70'],
      skin: { window: 0xff4a28, windowMul: 1.6, room: 0xff9a70, tint: [1.2, 0.82, 0.7], wall: 0xffb4a0, fog: 0x0d0503 } }
  ];

  function item(id) { return ITEMS.filter(function (i) { return i.id === id; })[0] || null; }
  function itemsIn(cat) { return ITEMS.filter(function (i) { return i.cat === cat; }); }
  function defaultFor(cat) { return itemsIn(cat).filter(function (i) { return i.price === 0; })[0]; }

  function store(state) {
    var s = state.shop || (state.shop = {});
    s.owned = s.owned || {};
    s.equipped = s.equipped || {};
    s.spent = s.spent || 0;
    return s;
  }

  function wallet(state) { return Math.max(0, (state.totalIngots || 0) - store(state).spent); }
  function owns(state, id) { var i = item(id); return !!i && (i.price === 0 || !!store(state).owned[id]); }

  function equippedId(state, cat) {
    var id = store(state).equipped[cat];
    return id && owns(state, id) ? id : defaultFor(cat).id;
  }

  // Buy and wear an item. Returns { ok, reason }.
  function buy(state, id, now) {
    var i = item(id);
    if (!i) return { ok: false, reason: 'unknown' };
    if (owns(state, id)) return { ok: false, reason: 'owned' };
    if (wallet(state) < i.price) return { ok: false, reason: 'funds' };
    var s = store(state);
    s.spent += i.price;
    s.owned[id] = now || Date.now();
    s.equipped[i.cat] = id;
    return { ok: true };
  }

  function equip(state, id) {
    var i = item(id);
    if (!i || !owns(state, id)) return false;
    store(state).equipped[i.cat] = id;
    return true;
  }

  // What the 3D forge needs: one skin per category.
  function skins(state) {
    var out = {};
    CATEGORIES.forEach(function (c) { out[c.id] = item(equippedId(state, c.id)).skin; });
    return out;
  }

  function ownedCount(state) { return ITEMS.filter(function (i) { return i.price > 0 && owns(state, i.id); }).length; }

  var api = {
    CATEGORIES: CATEGORIES, ITEMS: ITEMS,
    item: item, itemsIn: itemsIn, wallet: wallet, owns: owns, equippedId: equippedId,
    buy: buy, equip: equip, skins: skins, ownedCount: ownedCount
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SF = root.SF || {};
  root.SF.shop = api;
})(typeof window !== 'undefined' ? window : globalThis);
