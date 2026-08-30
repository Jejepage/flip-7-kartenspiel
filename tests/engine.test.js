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

  assert.equal(deck.length, 98);
  for (let value = 0; value <= 12; value += 1) {
    assert.equal(
      deck.filter((card) => card.type === 'number' && card.value === value).length,
      value + 1,
    );
  }
});

test('buildDeck includes every documented bonus and action card', () => {
  const { buildDeck } = loadEngine();
  const deck = buildDeck();

  assert.deepEqual(
    Array.from(deck.filter((card) => card.type === 'bonus').map((card) => card.points)).sort((a, b) => a - b),
    [2, 4, 6, 8, 10],
  );
  assert.deepEqual(
    Array.from(deck.filter((card) => card.type === 'action').map((card) => card.effect)).sort(),
    ['freeze', 'secondChance'],
  );
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

test('Zweite Chance saves exactly one duplicate number', () => {
  const { createRoundState, drawNumber, grantSecondChance } = loadEngine();
  let round = createRoundState([{ id: 'ada', name: 'Ada' }]);
  round = drawNumber(round, 'ada', 4);
  round = grantSecondChance(round, 'ada');
  round = drawNumber(round, 'ada', 4);

  assert.equal(round.players.ada.busted, false);
  assert.equal(round.players.ada.secondChance, false);
  assert.equal(round.players.ada.roundPoints, 4);
  assert.equal(round.players.ada.seenNumbers.length, 1);
  assert.equal(drawNumber(round, 'ada', 4).players.ada.busted, true);
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
  assert.equal(state.deck.length, 98);
});

test('Freeze banks only the selected other player current round points', () => {
  const { startLocalGame, createRoundState, drawNumber, freezePlayer } = loadEngine();
  const game = startLocalGame(['Ada', 'Bert', 'Cem']);
  const round = drawNumber(drawNumber(createRoundState(game.players), 'player-2', 3), 'player-2', 5);
  const frozen = freezePlayer({ ...game, round, phase: 'freezeTarget' }, 'player-2');

  assert.equal(frozen.scores['player-1'], 0);
  assert.equal(frozen.scores['player-2'], 8);
  assert.equal(frozen.scores['player-3'], 0);
  assert.equal(frozen.round.players['player-2'].banked, true);
  assert.equal(frozen.phase, 'turn');
});

test('Freeze rejects an already banked target without changing its score', () => {
  const { startLocalGame, freezePlayer } = loadEngine();
  const game = startLocalGame(['Ada', 'Bert']);
  const state = {
    ...game,
    phase: 'freezeTarget',
    scores: { ...game.scores, 'player-1': 7 },
    activePlayerIndex: 1,
    round: {
      ...game.round,
      players: {
        ...game.round.players,
        'player-1': { ...game.round.players['player-1'], banked: true, roundPoints: 7 },
      },
    },
  };

  assert.throws(() => freezePlayer(state, 'player-1'), /nicht.*banked|bereits.*gesichert/i);
  assert.equal(state.scores['player-1'], 7);
});

test('drawing Freeze with no eligible target returns to the turn instead of opening an empty target UI', () => {
  const { startLocalGame, showTurn, drawActiveCard } = loadEngine();
  const game = startLocalGame(['Ada', 'Bert']);
  const state = {
    ...game,
    deck: [{ type: 'action', effect: 'freeze', label: 'Freeze' }],
    round: {
      ...game.round,
      players: {
        ...game.round.players,
        'player-2': { ...game.round.players['player-2'], banked: true },
      },
    },
  };

  const result = drawActiveCard(showTurn(state));

  assert.equal(result.phase, 'turn');
  assert.match(result.lastEvent, /kein gültiges Ziel/i);
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

test('handoff live status announces both the bank or bust event and the next player', () => {
  const { startLocalGame, showTurn, drawActiveNumber, bankActivePlayer, handoffStatusMessage } = loadEngine();
  const bankStart = { ...startLocalGame(['Ada', 'Bert']), deck: [{ type: 'number', value: 5 }] };
  const afterBank = bankActivePlayer(drawActiveNumber(showTurn(bankStart)));
  const bustStart = { ...startLocalGame(['Ada', 'Bert']), deck: [{ type: 'number', value: 4 }, { type: 'number', value: 4 }] };
  const afterBust = drawActiveNumber(drawActiveNumber(showTurn(bustStart)));

  assert.equal(afterBank.phase, 'handoff');
  assert.equal(handoffStatusMessage(afterBank), 'Punkte gesichert. Zugwechsel: Bert ist als Nächstes am Zug.');
  assert.equal(afterBust.phase, 'handoff');
  assert.equal(handoffStatusMessage(afterBust), 'Doppelte Zahl – bust! Zugwechsel: Bert ist als Nächstes am Zug.');
});

test('drawing a bonus card adds its printed points and keeps the turn playable', () => {
  const { startLocalGame, showTurn, drawActiveCard } = loadEngine();
  const starting = { ...startLocalGame(['Ada', 'Bert']), deck: [{ type: 'bonus', points: 6, label: '+6' }] };
  const next = drawActiveCard(showTurn(starting));

  assert.equal(next.round.players['player-1'].roundPoints, 6);
  assert.equal(next.lastEvent, '+6 Rundenpunkte erhalten.');
  assert.equal(next.phase, 'turn');
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

test('after every player banks, the round result starts a fresh round with the next starter', () => {
  const { startLocalGame, showTurn, drawActiveNumber, bankActivePlayer, beginNextRound } = loadEngine();
  const first = { ...startLocalGame(['Ada', 'Bert']), deck: [{ type: 'number', value: 3 }] };
  const afterAda = bankActivePlayer(drawActiveNumber(showTurn(first)));
  const bertTurn = { ...afterAda, deck: [{ type: 'number', value: 4 }] };
  const result = bankActivePlayer(drawActiveNumber(showTurn(bertTurn)));
  const nextRound = beginNextRound(result);

  assert.equal(nextRound.scores['player-1'], 3);
  assert.equal(nextRound.scores['player-2'], 4);
  assert.equal(nextRound.roundStarterIndex, 1);
  assert.equal(nextRound.activePlayerIndex, 1);
  assert.equal(nextRound.phase, 'handoff');
  assert.equal(nextRound.round.players['player-1'].banked, false);
});

test('seven different numbers trigger Flip 7, add the documented 15-point bonus, and end the round', () => {
  const { startLocalGame, showTurn, drawActiveCard } = loadEngine();
  const game = startLocalGame(['Ada', 'Bert']);
  const prepared = {
    ...game,
    phase: 'handoff',
    deck: [{ type: 'number', value: 7 }],
    round: {
      ...game.round,
      players: {
        ...game.round.players,
        'player-1': { ...game.round.players['player-1'], seenNumbers: [0, 1, 2, 3, 4, 5], roundPoints: 15 },
      },
    },
  };
  const result = drawActiveCard(showTurn(prepared));

  assert.equal(result.phase, 'roundResult');
  assert.equal(result.scores['player-1'], 37);
  assert.match(result.lastEvent, /Flip 7/);
});

test('a tied high score at 200 continues to a round result instead of ending the game', () => {
  const { startLocalGame, finishRound } = loadEngine();
  const game = { ...startLocalGame(['Ada', 'Bert']), scores: { 'player-1': 200, 'player-2': 200 } };
  const result = finishRound(game);

  assert.equal(result.phase, 'roundResult');
  assert.equal(result.winnerId, null);
});

test('a sole leader at 200 wins when the round finishes', () => {
  const { startLocalGame, finishRound } = loadEngine();
  const game = { ...startLocalGame(['Ada', 'Bert']), scores: { 'player-1': 200, 'player-2': 199 } };
  const finished = finishRound(game);

  assert.equal(finished.phase, 'gameOver');
  assert.equal(finished.winnerId, 'player-1');
  assert.equal(finished.scores['player-1'], 200);
});

test('resetLocalGame always returns a safe two-player setup state without prior game data', () => {
  const { startLocalGame, resetLocalGame } = loadEngine();
  const activeGame = startLocalGame(['Ada', 'Bert', 'Cem']);

  const reset = resetLocalGame(activeGame);
  assert.equal(reset.phase, 'setup');
  assert.equal(reset.playerCount, 2);
  assert.deepEqual(Array.from(reset.names), []);
});
