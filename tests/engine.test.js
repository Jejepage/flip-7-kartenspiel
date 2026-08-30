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

function readyGame(names) {
  const state = loadEngine().startLocalGame(names);
  return { ...state, phase: 'handoff', initialDealCount: state.players.length };
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

test('initial deal records and holds each face-up card until that player continues the handoff', () => {
  const { startLocalGame, dealInitialCard, continueInitialDeal } = loadEngine();

  let state = {
    ...startLocalGame(['', 'Ada', 'Ada']),
    deck: [
      { type: 'number', value: 1 },
      { type: 'number', value: 2 },
      { type: 'bonus', points: 4, label: '+4' },
      { type: 'number', value: 9 },
    ],
  };

  assert.deepEqual(
    state.players.map((player) => player.name),
    ['Spieler 1', 'Ada', 'Ada 2'],
  );
  assert.equal(state.phase, 'initialDeal');
  assert.equal(state.activePlayerIndex, 0);
  assert.equal(state.roundStarterIndex, 0);

  state = dealInitialCard(state);
  assert.equal(state.phase, 'initialReveal');
  assert.equal(state.activePlayerIndex, 0);
  assert.deepEqual(state.lastCard, { type: 'number', value: 1 });
  assert.deepEqual(Array.from(state.round.players['player-1'].cards), [{ type: 'number', value: 1 }]);
  assert.deepEqual(Array.from(state.round.players['player-1'].seenNumbers), [1]);

  state = continueInitialDeal(state);
  assert.equal(state.phase, 'initialDeal');
  assert.equal(state.activePlayerIndex, 1);
  state = dealInitialCard(state);
  assert.equal(state.phase, 'initialReveal');
  assert.equal(state.activePlayerIndex, 1);
  assert.deepEqual(state.lastCard, { type: 'number', value: 2 });
  assert.deepEqual(Array.from(state.round.players['player-2'].cards), [{ type: 'number', value: 2 }]);

  state = continueInitialDeal(state);
  state = dealInitialCard(state);
  assert.equal(state.phase, 'initialReveal');
  assert.equal(state.activePlayerIndex, 2);
  assert.deepEqual(state.lastCard, { type: 'bonus', points: 4, label: '+4' });
  assert.deepEqual(Array.from(state.round.players['player-3'].cards), [{ type: 'bonus', points: 4, label: '+4' }]);
  assert.equal(state.round.players['player-3'].roundPoints, 4);

  state = continueInitialDeal(state);
  assert.equal(state.phase, 'handoff');
  assert.equal(state.activePlayerIndex, 0);
  assert.equal(state.initialDealCount, 3);
  assert.equal(state.deck.length, 1);
});

test('initial Freeze keeps the revealed card visible after target resolution until handoff continues', () => {
  const { startLocalGame, dealInitialCard, freezePlayer, continueInitialDeal } = loadEngine();
  const game = {
    ...startLocalGame(['Ada', 'Bert']),
    deck: [{ type: 'action', effect: 'freeze', label: 'Freeze' }],
    round: {
      players: {
        'player-1': { cards: [], seenNumbers: [], roundPoints: 0, busted: false, banked: false, secondChance: false },
        'player-2': { cards: [], seenNumbers: [], roundPoints: 5, busted: false, banked: false, secondChance: false },
      },
    },
  };

  const selecting = dealInitialCard(game);
  const resolved = freezePlayer(selecting, 'player-2');

  assert.equal(selecting.phase, 'freezeTarget');
  assert.deepEqual(selecting.lastCard, { type: 'action', effect: 'freeze', label: 'Freeze' });
  assert.equal(resolved.phase, 'initialReveal');
  assert.equal(resolved.activePlayerIndex, 0);
  assert.deepEqual(resolved.lastCard, { type: 'action', effect: 'freeze', label: 'Freeze' });
  assert.equal(resolved.scores['player-2'], 5);
  assert.equal(continueInitialDeal(resolved).phase, 'initialDeal');
});

test('one Hit reveals one card then hands the draw choice clockwise to the next eligible player', () => {
  const { startLocalGame, showTurn, drawActiveCard } = loadEngine();
  const starting = {
    ...readyGame(['Ada', 'Bert', 'Cem']),
    phase: 'handoff',
    deck: [{ type: 'number', value: 5 }, { type: 'number', value: 9 }],
  };

  const next = drawActiveCard(showTurn(starting));

  assert.deepEqual(Array.from(next.round.players['player-1'].seenNumbers), [5]);
  assert.equal(next.deck.length, 1);
  assert.equal(next.activePlayerIndex, 1);
  assert.equal(next.phase, 'handoff');
});

test('drawing Zweite Chance immediately hands off to the next eligible player', () => {
  const { showTurn, drawActiveCard } = loadEngine();
  const starting = {
    ...readyGame(['Ada', 'Bert', 'Cem']),
    deck: [{ type: 'action', effect: 'secondChance', label: 'Zweite Chance' }],
  };

  const next = drawActiveCard(showTurn(starting));

  assert.equal(next.round.players['player-1'].secondChance, true);
  assert.equal(next.activePlayerIndex, 1);
  assert.equal(next.phase, 'handoff');
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
  assert.equal(frozen.phase, 'handoff');
  assert.equal(frozen.activePlayerIndex, 2);
});

test('drawing Freeze selects an eligible target, banks it, then hands off clockwise', () => {
  const { showTurn, drawActiveCard, eligibleFreezeTargets, freezePlayer } = loadEngine();
  const game = readyGame(['Ada', 'Bert', 'Cem']);
  const starting = {
    ...game,
    deck: [{ type: 'action', effect: 'freeze', label: 'Freeze' }],
    round: {
      ...game.round,
      players: {
        ...game.round.players,
        'player-2': { ...game.round.players['player-2'], roundPoints: 8 },
      },
    },
  };

  const selecting = drawActiveCard(showTurn(starting));
  const resolved = freezePlayer(selecting, 'player-2');

  assert.equal(selecting.phase, 'freezeTarget');
  assert.deepEqual(Array.from(eligibleFreezeTargets(selecting).map((player) => player.id)), ['player-2', 'player-3']);
  assert.equal(resolved.scores['player-2'], 8);
  assert.equal(resolved.round.players['player-2'].banked, true);
  assert.equal(resolved.activePlayerIndex, 2);
  assert.equal(resolved.phase, 'handoff');
});

test('Freeze rejects an already banked target without changing its score', () => {
  const { startLocalGame, freezePlayer } = loadEngine();
  const game = readyGame(['Ada', 'Bert']);
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

test('Freeze rejects a busted target without changing its score', () => {
  const { freezePlayer } = loadEngine();
  const game = readyGame(['Ada', 'Bert']);
  const state = {
    ...game,
    phase: 'freezeTarget',
    activePlayerIndex: 1,
    scores: { ...game.scores, 'player-1': 7 },
    round: {
      ...game.round,
      players: {
        ...game.round.players,
        'player-1': { ...game.round.players['player-1'], busted: true, roundPoints: 0 },
      },
    },
  };

  assert.throws(() => freezePlayer(state, 'player-1'), /gebustete Person/i);
  assert.equal(state.scores['player-1'], 7);
});

test('drawing Freeze with only a busted opponent hands off instead of opening an empty target UI', () => {
  const { startLocalGame, showTurn, drawActiveCard } = loadEngine();
  const game = readyGame(['Ada', 'Bert']);
  const state = {
    ...game,
    deck: [{ type: 'action', effect: 'freeze', label: 'Freeze' }],
    round: {
      ...game.round,
      players: {
        ...game.round.players,
        'player-2': { ...game.round.players['player-2'], busted: true, roundPoints: 0 },
      },
    },
  };

  const result = drawActiveCard(showTurn(state));

  assert.equal(result.phase, 'handoff');
  assert.equal(result.activePlayerIndex, 0);
  assert.match(result.lastEvent, /kein gültiges Ziel/i);
});

test('a used Zweite Chance duplicate completes the Hit and hands off', () => {
  const { showTurn, drawActiveCard } = loadEngine();
  const state = {
    ...readyGame(['Ada', 'Bert']),
    deck: [{ type: 'number', value: 4 }],
    round: { players: {
      'player-1': { cards: [{ type: 'number', value: 4 }], seenNumbers: [4], roundPoints: 4, busted: false, banked: false, secondChance: true },
      'player-2': { cards: [], seenNumbers: [], roundPoints: 0, busted: false, banked: false, secondChance: false },
    } },
  };
  const result = drawActiveCard(showTurn(state));

  assert.equal(result.round.players['player-1'].busted, false);
  assert.equal(result.round.players['player-1'].secondChance, false);
  assert.equal(result.phase, 'handoff');
  assert.equal(result.activePlayerIndex, 1);
});

test('bankActivePlayer adds active points then hands off to the next player', () => {
  const { startLocalGame, showTurn, drawActiveNumber, bankActivePlayer } = loadEngine();
  const starting = { ...readyGame(['Ada', 'Bert']), round: { players: { 'player-1': { cards: [{ type: 'number', value: 5 }], seenNumbers: [5], roundPoints: 5, busted: false, banked: false, secondChance: false }, 'player-2': { cards: [], seenNumbers: [], roundPoints: 0, busted: false, banked: false, secondChance: false } } } };
  const next = bankActivePlayer(showTurn(starting));

  assert.equal(next.scores['player-1'], 5);
  assert.equal(next.scores['player-2'], 0);
  assert.equal(next.round.players['player-1'].banked, true);
  assert.equal(next.activePlayerIndex, 1);
  assert.equal(next.phase, 'handoff');
});

test('handoff live status announces both the bank or bust event and the next player', () => {
  const { startLocalGame, showTurn, drawActiveNumber, bankActivePlayer, handoffStatusMessage } = loadEngine();
  const bankStart = { ...readyGame(['Ada', 'Bert']), round: { players: { 'player-1': { cards: [{ type: 'number', value: 5 }], seenNumbers: [5], roundPoints: 5, busted: false, banked: false, secondChance: false }, 'player-2': { cards: [], seenNumbers: [], roundPoints: 0, busted: false, banked: false, secondChance: false } } } };
  const afterBank = bankActivePlayer(showTurn(bankStart));
  const bustStart = { ...readyGame(['Ada', 'Bert']), deck: [{ type: 'number', value: 4 }, { type: 'number', value: 4 }] };
  const afterFirstHit = drawActiveNumber(showTurn(bustStart));
  const afterBust = drawActiveNumber(showTurn({ ...afterFirstHit, activePlayerIndex: 0 }));

  assert.equal(afterBank.phase, 'handoff');
  assert.equal(handoffStatusMessage(afterBank), 'Punkte gesichert. Zugwechsel: Bert ist als Nächstes am Zug.');
  assert.equal(afterBust.phase, 'handoff');
  assert.equal(handoffStatusMessage(afterBust), 'Doppelte Zahl – bust! Zugwechsel: Bert ist als Nächstes am Zug.');
});

test('drawing a bonus card adds its printed points and hands off', () => {
  const { startLocalGame, showTurn, drawActiveCard } = loadEngine();
  const starting = { ...readyGame(['Ada', 'Bert']), deck: [{ type: 'bonus', points: 6, label: '+6' }] };
  const next = drawActiveCard(showTurn(starting));

  assert.equal(next.round.players['player-1'].roundPoints, 6);
  assert.equal(next.lastEvent, '+6 Rundenpunkte erhalten.');
  assert.equal(next.phase, 'handoff');
  assert.equal(next.activePlayerIndex, 1);
});

test('drawActiveNumber busts on a duplicate and hands off without scoring', () => {
  const { startLocalGame, showTurn, drawActiveNumber } = loadEngine();
  const starting = {
    ...readyGame(['Ada', 'Bert']),
    deck: [{ type: 'number', value: 4 }, { type: 'number', value: 4 }],
  };
  const afterFirst = drawActiveNumber(showTurn(starting));
  const afterDuplicate = drawActiveNumber(showTurn({ ...afterFirst, activePlayerIndex: 0 }));

  assert.equal(afterDuplicate.round.players['player-1'].busted, true);
  assert.equal(afterDuplicate.round.players['player-1'].roundPoints, 0);
  assert.equal(afterDuplicate.scores['player-1'], 0);
  assert.equal(afterDuplicate.activePlayerIndex, 1);
  assert.equal(afterDuplicate.phase, 'handoff');
});

test('after every player banks, the round result starts a fresh round with the next starter', () => {
  const { startLocalGame, showTurn, drawActiveNumber, bankActivePlayer, beginNextRound } = loadEngine();
  const first = { ...readyGame(['Ada', 'Bert']), round: { players: { 'player-1': { cards: [{ type: 'number', value: 3 }], seenNumbers: [3], roundPoints: 3, busted: false, banked: false, secondChance: false }, 'player-2': { cards: [], seenNumbers: [], roundPoints: 0, busted: false, banked: false, secondChance: false } } } };
  const afterAda = bankActivePlayer(showTurn(first));
  const bertTurn = { ...afterAda, round: { ...afterAda.round, players: { ...afterAda.round.players, 'player-2': { ...afterAda.round.players['player-2'], cards: [{ type: 'number', value: 4 }], seenNumbers: [4], roundPoints: 4 } } } };
  const result = bankActivePlayer(showTurn(bertTurn));
  const nextRound = beginNextRound(result);

  assert.equal(nextRound.scores['player-1'], 3);
  assert.equal(nextRound.scores['player-2'], 4);
  assert.equal(nextRound.roundStarterIndex, 1);
  assert.equal(nextRound.activePlayerIndex, 1);
  assert.equal(nextRound.phase, 'initialDeal');
  assert.equal(nextRound.round.players['player-1'].banked, false);
});

test('seven different numbers trigger Flip 7, add the documented 15-point bonus, and end the round', () => {
  const { startLocalGame, showTurn, drawActiveCard } = loadEngine();
  const game = readyGame(['Ada', 'Bert']);
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
  const game = { ...readyGame(['Ada', 'Bert']), scores: { 'player-1': 200, 'player-2': 200 } };
  const result = finishRound(game);

  assert.equal(result.phase, 'roundResult');
  assert.equal(result.winnerId, null);
});

test('a sole leader at 200 wins when the round finishes', () => {
  const { startLocalGame, finishRound } = loadEngine();
  const game = { ...readyGame(['Ada', 'Bert']), scores: { 'player-1': 200, 'player-2': 199 } };
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
