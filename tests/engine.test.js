const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadEngine() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const match = html.match(/\/\* GAME_ENGINE_START \*\/[\s\S]*?\/\* GAME_ENGINE_END \*\//);
  if (!match) throw new Error('Marked game engine section not found');

  const context = { module: { exports: {} }, exports: {} };
  vm.runInNewContext(match[0], context, { filename: 'index.html' });
  return context.module.exports;
}

test('buildDeck creates the documented number-card distribution', () => {
  const { buildDeck } = loadEngine();
  const deck = buildDeck();

  assert.equal(deck.length, 91);
  for (let value = 0; value <= 12; value += 1) {
    assert.equal(
      deck.filter((card) => card.type === 'number' && card.value === value).length,
      value + 1,
    );
  }
});

test('drawNumber busts a player who reveals a duplicate number', () => {
  const { createRoundState, drawNumber } = loadEngine();
  const initial = createRoundState([{ id: 'ada', name: 'Ada' }]);
  const afterFirstDraw = drawNumber(initial, 'ada', 4);
  const afterDuplicate = drawNumber(afterFirstDraw, 'ada', 4);

  assert.equal(afterDuplicate.players.ada.busted, true);
  assert.equal(afterDuplicate.players.ada.roundPoints, 0);
});

test('bankPoints transfers only the active player round points to their total', () => {
  const { createGameState, createRoundState, drawNumber, bankPoints } = loadEngine();
  const game = createGameState([{ id: 'ada', name: 'Ada' }, { id: 'bert', name: 'Bert' }]);
  const round = drawNumber(drawNumber(createRoundState(game.players), 'ada', 3), 'ada', 5);
  const result = bankPoints(game, round, 'ada');

  assert.equal(result.game.scores.ada, 8);
  assert.equal(result.game.scores.bert, 0);
  assert.equal(result.round.players.ada.banked, true);
});

test('calculateNumberPoints totals revealed number-card values', () => {
  const { calculateNumberPoints } = loadEngine();

  assert.equal(calculateNumberPoints([{ type: 'number', value: 0 }, { type: 'number', value: 4 }, { type: 'number', value: 12 }]), 16);
});

test('hasFlip7 recognizes seven different revealed numbers', () => {
  const { createRoundState, drawNumber, hasFlip7 } = loadEngine();
  let round = createRoundState([{ id: 'ada', name: 'Ada' }]);
  for (let value = 0; value < 7; value += 1) {
    round = drawNumber(round, 'ada', value);
  }

  assert.equal(hasFlip7(round, 'ada'), true);
});
