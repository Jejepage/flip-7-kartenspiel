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

test('startLocalGame normalizes player names and opens the first handoff', () => {
  const { startLocalGame } = loadEngine();

  const state = startLocalGame(['', 'Ada', 'Ada']);

  assert.deepEqual(
    state.players.map((player) => player.name),
    ['Spieler 1', 'Ada', 'Ada 2'],
  );
  assert.equal(state.phase, 'handoff');
  assert.equal(state.activePlayerIndex, 0);
  assert.equal(state.roundStarterIndex, 0);
  assert.equal(state.deck.length, 91);
});

test('bankActivePlayer adds active points then hands off to the next player', () => {
  const { startLocalGame, showTurn, drawActiveNumber, bankActivePlayer } = loadEngine();
  const starting = { ...startLocalGame(['Ada', 'Bert']), deck: [{ type: 'number', value: 5 }] };
  const revealed = drawActiveNumber(showTurn(starting));
  const next = bankActivePlayer(revealed);

  assert.equal(next.scores['player-1'], 5);
  assert.equal(next.scores['player-2'], 0);
  assert.equal(next.round.players['player-1'].banked, true);
  assert.equal(next.activePlayerIndex, 1);
  assert.equal(next.phase, 'handoff');
});

test('drawActiveNumber busts on a duplicate and hands off without scoring', () => {
  const { startLocalGame, showTurn, drawActiveNumber } = loadEngine();
  const starting = {
    ...startLocalGame(['Ada', 'Bert']),
    deck: [{ type: 'number', value: 4 }, { type: 'number', value: 4 }],
  };
  const afterFirst = drawActiveNumber(showTurn(starting));
  const afterDuplicate = drawActiveNumber(afterFirst);

  assert.equal(afterDuplicate.round.players['player-1'].busted, true);
  assert.equal(afterDuplicate.round.players['player-1'].roundPoints, 0);
  assert.equal(afterDuplicate.scores['player-1'], 0);
  assert.equal(afterDuplicate.activePlayerIndex, 1);
  assert.equal(afterDuplicate.phase, 'handoff');
});

test('after every player banks, a fresh round begins with the next starter', () => {
  const { startLocalGame, showTurn, drawActiveNumber, bankActivePlayer } = loadEngine();
  const first = { ...startLocalGame(['Ada', 'Bert']), deck: [{ type: 'number', value: 3 }] };
  const afterAda = bankActivePlayer(drawActiveNumber(showTurn(first)));
  const bertTurn = { ...afterAda, deck: [{ type: 'number', value: 4 }] };
  const nextRound = bankActivePlayer(drawActiveNumber(showTurn(bertTurn)));

  assert.equal(nextRound.scores['player-1'], 3);
  assert.equal(nextRound.scores['player-2'], 4);
  assert.equal(nextRound.roundStarterIndex, 1);
  assert.equal(nextRound.activePlayerIndex, 1);
  assert.equal(nextRound.phase, 'handoff');
  assert.equal(nextRound.round.players['player-1'].banked, false);
});

test('bankActivePlayer declares the first player to reach 200 the winner', () => {
  const { startLocalGame, showTurn, drawActiveNumber, bankActivePlayer } = loadEngine();
  const game = startLocalGame(['Ada', 'Bert']);
  const nearlyWon = { ...game, scores: { ...game.scores, 'player-1': 199 }, deck: [{ type: 'number', value: 1 }] };
  const finished = bankActivePlayer(drawActiveNumber(showTurn(nearlyWon)));

  assert.equal(finished.phase, 'gameOver');
  assert.equal(finished.winnerId, 'player-1');
  assert.equal(finished.scores['player-1'], 200);
});
