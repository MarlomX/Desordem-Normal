import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AREAS,
  NOT_ACTED,
  PHASES,
  actedBefore,
  actedPhases,
  areaOf,
  currentPhase,
  groupByArea,
  isPhaseCombat,
  movePhase,
  shiftPhase,
} from '../scripts/rolls/phases.js';

test('as fases seguem a ordem da regra e as áreas terminam em «não agiu»', () => {
  assert.deepEqual(PHASES, ['geral', 'distancia', 'corpo']);
  assert.deepEqual(AREAS, ['geral', 'distancia', 'corpo', 'nenhuma']);
});

test('perseguição e furtividade não usam as fases; o combate comum usa', () => {
  assert.equal(isPhaseCombat('base'), true);
  assert.equal(isPhaseCombat(undefined), true);
  assert.equal(isPhaseCombat('perseguicao'), false);
  assert.equal(isPhaseCombat('furtividade'), false);
});

test('currentPhase começa na geral e o registro de outra rodada não vale', () => {
  assert.equal(currentPhase(undefined, 1), 'geral');
  assert.equal(currentPhase({ fase: 'corpo', rodada: 2 }, 2), 'corpo');
  assert.equal(currentPhase({ fase: 'corpo', rodada: 2 }, 3), 'geral');
  assert.equal(currentPhase({ fase: 'xyz', rodada: 2 }, 2), 'geral');
  // Combate não iniciado (rodada 0 ou indefinida) também guarda a fase
  assert.equal(currentPhase({ fase: 'distancia', rodada: 0 }, undefined), 'distancia');
});

test('shiftPhase avança e volta sem passar das pontas', () => {
  assert.deepEqual(shiftPhase(undefined, 1, 1), { fase: 'distancia', rodada: 1 });
  assert.deepEqual(shiftPhase({ fase: 'distancia', rodada: 1 }, 1, 1), {
    fase: 'corpo',
    rodada: 1,
  });
  assert.deepEqual(shiftPhase({ fase: 'corpo', rodada: 1 }, 1, 1), { fase: 'corpo', rodada: 1 });
  assert.deepEqual(shiftPhase({ fase: 'distancia', rodada: 1 }, 1, -1), {
    fase: 'geral',
    rodada: 1,
  });
  assert.deepEqual(shiftPhase(undefined, 1, -1), { fase: 'geral', rodada: 1 });
  // Registro da rodada passada: parte da geral da rodada nova
  assert.deepEqual(shiftPhase({ fase: 'corpo', rodada: 1 }, 2, 1), {
    fase: 'distancia',
    rodada: 2,
  });
});

test('actedPhases e areaOf: só valem os registros desta rodada', () => {
  const entry = { rodada: 3, fases: ['corpo', 'geral', 'geral', 'voar'] };
  assert.deepEqual(actedPhases(entry, 3), ['geral', 'corpo']);
  assert.equal(areaOf(entry, 3), 'corpo');
  assert.deepEqual(actedPhases(entry, 4), []);
  assert.equal(areaOf(entry, 4), NOT_ACTED);
  assert.equal(areaOf(undefined, 1), NOT_ACTED);
  assert.deepEqual(actedPhases({ rodada: 1, fases: 'geral' }, 1), []);
});

test('movePhase move (troca a fase), soma com Shift e limpa com «não agiu»', () => {
  const geral = movePhase(undefined, 2, 'geral');
  assert.deepEqual(geral, { rodada: 2, fases: ['geral'] });
  assert.deepEqual(movePhase(geral, 2, 'corpo'), { rodada: 2, fases: ['corpo'] });
  assert.deepEqual(movePhase(geral, 2, 'corpo', { add: true }), {
    rodada: 2,
    fases: ['geral', 'corpo'],
  });
  assert.deepEqual(movePhase(geral, 2, NOT_ACTED), { rodada: 2, fases: [] });
  assert.deepEqual(movePhase(geral, 2, 'voar'), { rodada: 2, fases: ['geral'] });
  // O registro de uma rodada passada não se soma ao da rodada nova
  assert.deepEqual(movePhase(geral, 3, 'corpo', { add: true }), { rodada: 3, fases: ['corpo'] });
});

test('actedBefore avisa quem já agiu numa fase anterior à escolhida', () => {
  const geral = { rodada: 1, fases: ['geral'] };
  assert.equal(actedBefore(geral, 1, 'corpo'), true);
  assert.equal(actedBefore(geral, 1, 'geral'), false);
  assert.equal(actedBefore({ rodada: 1, fases: ['corpo'] }, 1, 'distancia'), false);
  assert.equal(actedBefore(geral, 2, 'corpo'), false);
  assert.equal(actedBefore(geral, 1, NOT_ACTED), false);
});

test('groupByArea separa pelas áreas na ordem recebida e marca quem agiu em duas fases', () => {
  const { areas, earlier } = groupByArea(
    [
      { id: 'a', entry: { rodada: 1, fases: ['distancia'] } },
      { id: 'b' },
      { id: 'c', entry: { rodada: 1, fases: ['geral', 'corpo'] } },
      { id: 'd', entry: { rodada: 1, fases: ['distancia'] } },
      { id: 'e', entry: { rodada: 0, fases: ['geral'] } },
    ],
    1,
  );
  assert.deepEqual(areas, { geral: [], distancia: ['a', 'd'], corpo: ['c'], nenhuma: ['b', 'e'] });
  assert.deepEqual(earlier, { c: ['geral'] });
});
