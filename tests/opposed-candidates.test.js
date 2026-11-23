// Teste oposto (v0.25.3): quem pode aceitar o lado em aberto.
import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptCandidates } from '../scripts/opposed/candidates.js';

const actor = (uuid, type = 'personagem', isOwner = true) => ({ uuid, type, isOwner });
const djavan = actor('Actor.djavan');
const ana = actor('Actor.ana');
const monstro = actor('Actor.monstro', 'criatura');
const outroDono = actor('Actor.outro', 'personagem', false);
const loot = actor('Actor.loot', 'npc');

test('mestre sem tokens na cena: todos os personagens e criaturas do mundo, menos quem propôs', () => {
  const list = acceptCandidates({
    isGM: true,
    sceneActors: [djavan],
    worldActors: [djavan, ana, monstro, loot],
    excludeUuid: djavan.uuid,
  });
  assert.deepEqual(list, [ana, monstro]);
});

test('mestre com tokens na cena: só eles (a reserva do mundo não entra)', () => {
  const list = acceptCandidates({
    isGM: true,
    sceneActors: [djavan, monstro],
    worldActors: [djavan, ana, monstro],
    excludeUuid: djavan.uuid,
  });
  assert.deepEqual(list, [monstro]);
});

test('selecionados e personagem vinculado vêm primeiro, sem repetir', () => {
  const list = acceptCandidates({
    isGM: true,
    controlled: [monstro],
    character: ana,
    sceneActors: [ana, monstro],
    excludeUuid: djavan.uuid,
  });
  assert.deepEqual(list, [monstro, ana]);
});

test('jogador: só os atores de que é dono, sem a reserva do mestre', () => {
  assert.deepEqual(
    acceptCandidates({
      isGM: false,
      worldActors: [djavan, ana, outroDono],
      excludeUuid: djavan.uuid,
    }),
    [ana],
  );
  assert.deepEqual(
    acceptCandidates({ isGM: false, worldActors: [djavan], excludeUuid: djavan.uuid }),
    [],
  );
});
