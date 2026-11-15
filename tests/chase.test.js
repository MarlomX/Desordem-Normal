import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import {
  CHASE_COMBAT_TYPE,
  CHASE_COMBATANT_TYPE,
  initialChaseState,
  startState,
  endState,
  addableActors,
  chaseAccess,
  trackerAction,
  shouldAutoOpen,
} from '../scripts/rolls/chase.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('estados do ciclo de vida: preparação, em andamento e de volta à preparação', () => {
  assert.deepEqual(initialChaseState(), { ativa: false, rodadaAtual: 0 });
  assert.deepEqual(startState(), { ativa: true, rodadaAtual: 1 });
  assert.deepEqual(endState(), { ativa: false, rodadaAtual: 0 });
});

test('estados devolvem objetos novos (ninguém altera o de outro)', () => {
  assert.notEqual(initialChaseState(), initialChaseState());
});

test('addableActors tira quem já participa e ordena por nome', () => {
  const candidates = [
    { id: 'c', name: 'Ótavo' },
    { id: 'a', name: 'Beatriz' },
    { id: 'b', name: 'Ana' },
  ];
  assert.deepEqual(
    addableActors(candidates, ['a']).map((actor) => actor.id),
    ['b', 'c'],
  );
  assert.deepEqual(addableActors(candidates, ['a', 'b', 'c']), []);
  assert.equal(addableActors(candidates, []).length, 3);
});

test('addableActors não altera a lista recebida', () => {
  const candidates = [
    { id: 'b', name: 'Bia' },
    { id: 'a', name: 'Ana' },
  ];
  addableActors(candidates, []);
  assert.deepEqual(
    candidates.map((actor) => actor.id),
    ['b', 'a'],
  );
});

test('acesso do mestre', () => {
  assert.deepEqual(chaseAccess({ isGM: true, chase: null, isParticipant: false }), {
    canCreate: true,
    canManage: false,
    canOpen: false,
    showCard: false,
  });
  const prep = chaseAccess({ isGM: true, chase: { ativa: false }, isParticipant: false });
  assert.equal(prep.canCreate, false);
  assert.equal(prep.canManage, true);
  assert.equal(prep.canOpen, true);
  assert.equal(prep.showCard, false);
});

test('o mestre vê o cartão de um participante mesmo na preparação', () => {
  const access = chaseAccess({ isGM: true, chase: { ativa: false }, isParticipant: true });
  assert.equal(access.showCard, true);
});

test('o jogador só abre a perseguição em andamento e se participar', () => {
  const open = (ativa, isParticipant) =>
    chaseAccess({ isGM: false, chase: { ativa }, isParticipant }).canOpen;
  assert.equal(open(true, true), true);
  assert.equal(open(true, false), false);
  assert.equal(open(false, true), false);
  assert.equal(chaseAccess({ isGM: false, chase: null, isParticipant: true }).canOpen, false);
});

test('o jogador nunca cria nem administra', () => {
  const access = chaseAccess({ isGM: false, chase: null, isParticipant: true });
  assert.equal(access.canCreate, false);
  assert.equal(access.canManage, false);
  assert.equal(
    chaseAccess({ isGM: false, chase: { ativa: true }, isParticipant: true }).canManage,
    false,
  );
});

test('o cartão da ficha do jogador só aparece com a perseguição em andamento', () => {
  const card = (ativa) => chaseAccess({ isGM: false, chase: { ativa }, isParticipant: true });
  assert.equal(card(true).showCard, true);
  assert.equal(card(false).showCard, false);
  assert.equal(
    chaseAccess({ isGM: false, chase: { ativa: true }, isParticipant: false }).showCard,
    false,
  );
});

test('botão da aba de combate: criar, abrir ou nada', () => {
  assert.equal(
    trackerAction(chaseAccess({ isGM: true, chase: null, isParticipant: false })),
    'criar',
  );
  assert.equal(
    trackerAction(chaseAccess({ isGM: true, chase: { ativa: false }, isParticipant: false })),
    'abrir',
  );
  assert.equal(
    trackerAction(chaseAccess({ isGM: false, chase: { ativa: true }, isParticipant: true })),
    'abrir',
  );
  assert.equal(
    trackerAction(chaseAccess({ isGM: false, chase: { ativa: false }, isParticipant: true })),
    null,
  );
  assert.equal(
    trackerAction(chaseAccess({ isGM: false, chase: null, isParticipant: false })),
    null,
  );
});

test('abertura automática da janela', () => {
  const gmAuthor = { isGM: true, isAuthor: true, ownsParticipant: true };
  const gmOther = { isGM: true, isAuthor: false, ownsParticipant: true };
  const player = { isGM: false, isAuthor: false, ownsParticipant: true };
  const outsider = { isGM: false, isAuthor: false, ownsParticipant: false };

  assert.equal(shouldAutoOpen('created', gmAuthor), true);
  assert.equal(shouldAutoOpen('created', gmOther), false);
  assert.equal(shouldAutoOpen('created', player), false);

  assert.equal(shouldAutoOpen('started', gmAuthor), true);
  assert.equal(shouldAutoOpen('started', gmOther), false);
  assert.equal(shouldAutoOpen('started', player), true);
  assert.equal(shouldAutoOpen('started', outsider), false);

  assert.equal(shouldAutoOpen('joined', player), true);
  assert.equal(shouldAutoOpen('joined', outsider), false);
  assert.equal(shouldAutoOpen('joined', gmAuthor), false);

  assert.equal(shouldAutoOpen('desconhecido', player), false);
});

test('o system.json registra os subtipos de Combat e de Combatant', () => {
  const { documentTypes } = JSON.parse(read('system.json'));
  assert.ok(documentTypes.Combat?.[CHASE_COMBAT_TYPE]);
  assert.ok(documentTypes.Combatant?.[CHASE_COMBATANT_TYPE]);
});

test('os templates da perseguição existem', () => {
  for (const file of ['painel.hbs', 'adicionar.hbs']) {
    assert.ok(existsSync(new URL(`../templates/perseguicao/${file}`, import.meta.url)), file);
  }
  assert.ok(existsSync(new URL('../templates/actor/ficha-perseguicao.hbs', import.meta.url)));
});
