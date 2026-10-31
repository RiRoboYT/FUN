'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../js/logic.js');
const Q = require('../js/quests.js');
const SH = require('../js/shop.js');

const MIN = 60000;
const NOW = new Date(2026, 9, 28, 18, 0).getTime(); // a Wednesday evening

function session(over) {
  return Object.assign({ id: 's' + Math.random(), mode: 'stopwatch', subject: 'Physics', startedAt: NOW - 3600000,
    endedAt: NOW - 60000, studied: 50 * MIN, intentional: 0, distracted: 0, peakStage: 3, cracks: 0,
    completed: true, blocksDone: 0, ingots: 10 }, over);
}
function state(sessions, extra) {
  return Object.assign({ totalIngots: 500, sessions: sessions || [] }, extra);
}

test('each day gets 3 daily and 2 weekly quests, stable across calls', () => {
  const s = state();
  const a = Q.list(s, NOW), b = Q.list(s, NOW + 1000);
  assert.equal(a.daily.length, 3);
  assert.equal(a.weekly.length, 2);
  assert.deepEqual(a.daily.map((q) => q.id), b.daily.map((q) => q.id));
  assert.equal(new Set(a.daily.map((q) => q.id)).size, 3);
});

test('the daily set changes on another day', () => {
  const s = state();
  const days = new Set();
  for (let d = 0; d < 6; d++) days.add(Q.list(s, NOW + d * 86400000).daily.map((q) => q.id).join());
  assert.ok(days.size > 1);
});

test('progress comes from timed sessions only, and claiming pays once', () => {
  const s = state([session({ studied: 200 * MIN, peakStage: 4, blocksDone: 3 }), session({ mode: 'manual', studied: 600 * MIN })]);
  const all = Q.list(s, NOW);
  const done = all.daily.concat(all.weekly).filter((q) => q.done);
  assert.ok(done.length >= 1);
  const q = done[0];
  const before = s.totalIngots;
  assert.equal(Q.claim(s, q.key, NOW), q.reward);
  assert.equal(s.totalIngots, before + q.reward);
  assert.equal(Q.claim(s, q.key, NOW), 0);
  // Manual logging never completes a minutes quest by itself.
  const onlyManual = state([session({ mode: 'manual', studied: 600 * MIN })]);
  Q.list(onlyManual, NOW).daily.forEach((x) => assert.equal(x.value, 0));
});

test('unfinished quests cannot be claimed', () => {
  const s = state();
  const q = Q.list(s, NOW).daily[0];
  assert.equal(Q.claim(s, q.key, NOW), 0);
  assert.equal(s.totalIngots, 500);
});

test('one reroll a day swaps an unfinished daily quest', () => {
  const s = state();
  const before = Q.list(s, NOW).daily.map((q) => q.id);
  assert.equal(Q.reroll(s, 1, NOW), true);
  const after = Q.list(s, NOW);
  assert.notEqual(after.daily[1].id, before[1]);
  assert.equal(after.daily[0].id, before[0]);
  assert.equal(after.canReroll, false);
  assert.equal(Q.reroll(s, 0, NOW), false);
});

test('freshly finished quests are announced once', () => {
  const s = state([session({ studied: 200 * MIN, peakStage: 4, blocksDone: 3 })]);
  const first = Q.freshlyDone(s, NOW);
  assert.ok(first.length >= 1);
  assert.equal(Q.freshlyDone(s, NOW).length, 0);
});

test('shop: buying spends the wallet, not alloy progress', () => {
  const s = state([], { totalIngots: 300 });
  assert.equal(SH.wallet(s), 300);
  assert.equal(SH.equippedId(s, 'ember'), 'ember_classic');
  assert.deepEqual(SH.buy(s, 'ember_blue', NOW), { ok: true });
  assert.equal(SH.wallet(s), 160);
  assert.equal(s.totalIngots, 300);
  assert.equal(L.alloyIndex({ totalIngots: s.totalIngots, longestStudiedMin: 60, bestStreak: 0 }), 2);
  assert.equal(SH.equippedId(s, 'ember'), 'ember_blue');
  assert.equal(SH.buy(s, 'ember_blue', NOW).reason, 'owned');
  assert.equal(SH.buy(s, 'anvil_gold', NOW).reason, 'funds');
  assert.equal(SH.equip(s, 'anvil_gold'), false);
  assert.equal(SH.equip(s, 'ember_classic'), true);
  assert.deepEqual(SH.skins(s).ember, SH.item('ember_classic').skin);
});

test('every shop category has exactly one free default', () => {
  SH.CATEGORIES.forEach((c) => {
    assert.equal(SH.itemsIn(c.id).filter((i) => i.price === 0).length, 1, c.id);
  });
});
