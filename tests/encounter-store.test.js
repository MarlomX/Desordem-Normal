/**
 * Ciclo de vida da perseguição e da cena de furtividade (Combat de subtipo próprio). Escritos na
 * v0.28.4, antes das duas passarem a usar o módulo comum (`scripts/shared/encounter.js`): fixam
 * criar, iniciar, encerrar, apagar, adicionar e tirar participantes.
 */
import { log, makeUser, resetFoundry } from './foundry-stub.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  actorParticipates,
  addParticipants,
  createChase,
  deleteChase,
  endChase,
  findChase,
  removeParticipant,
  startChase,
} from '../scripts/chase/store.js';
import {
  addStealthParticipants,
  combatantOf,
  createStealth,
  deleteStealth,
  endStealth,
  findStealth,
  hideRevealed,
  isRevealed,
  removeStealthParticipant,
  startStealth,
} from '../scripts/stealth/store.js';
import {
  endState,
  initialChaseState,
  participantReset,
  participantStart,
  startState,
} from '../scripts/rolls/chase.js';
import {
  initialStealthState,
  stealthEndState,
  stealthParticipantReset,
  stealthStartState,
} from '../scripts/rolls/stealth.js';

/** Combat de mentira: guarda o que foi gravado. */
function makeCombat(data) {
  const combat = {
    id: `c${game.combats.size + 1}`,
    type: data.type,
    system: structuredClone(data.system),
    scene: data.scene,
    combatants: [],
    calls: [],
    async update(changes) {
      combat.calls.push(['update', changes]);
      Object.assign(combat.system, changes.system);
    },
    async updateEmbeddedDocuments(kind, updates) {
      combat.calls.push(['updateEmbedded', kind, updates]);
    },
    async createEmbeddedDocuments(kind, list) {
      combat.calls.push(['createEmbedded', kind, list]);
      for (const entry of list) {
        combat.combatants.push({ id: `p${combat.combatants.length + 1}`, ...entry });
      }
    },
    async deleteEmbeddedDocuments(kind, ids) {
      combat.calls.push(['deleteEmbedded', kind, ids]);
      combat.combatants = combat.combatants.filter((entry) => !ids.includes(entry.id));
    },
    async delete() {
      combat.calls.push(['delete']);
      combat.deleted = true;
    },
  };
  return combat;
}

/** Classe Combat de mentira; `rejectNoScene` imita um Foundry que recusa Combat sem cena. */
function setup({ user = makeUser('gm', { isGM: true }), rejectNoScene = false } = {}) {
  resetFoundry({ user });
  const created = [];
  globalThis.getDocumentClass = () => ({
    async create(data) {
      if (rejectNoScene && data.scene === null) throw new Error('sem cena');
      const combat = makeCombat(data);
      created.push(data);
      game.combats.add(combat);
      return combat;
    },
  });
  return created;
}

const actor = (id, vigor = 8) => ({ id, system: { pericias: { vigor } } });

test('perseguição: só o mestre cria, sem cena, e só uma por vez', async () => {
  const created = setup();
  const chase = await createChase();
  assert.equal(findChase(), chase);
  assert.deepEqual(created, [{ type: 'perseguicao', system: initialChaseState(), scene: null }]);
  assert.equal(await createChase(), null);
  assert.deepEqual(log.warnings, ['DESORDEM.Perseguicao.Erro.JaExiste']);
  setup({ user: makeUser('p') });
  assert.equal(await createChase(), null);
  assert.equal(findChase(), null);
});

test('perseguição: se o Foundry recusar Combat sem cena, cria com a cena padrão', async () => {
  const created = setup({ rejectNoScene: true });
  const original = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args);
  try {
    assert.ok(await createChase());
  } finally {
    console.warn = original;
  }
  assert.deepEqual(created, [{ type: 'perseguicao', system: initialChaseState() }]);
  assert.equal(warnings.length, 1);
});

test('perseguição: iniciar dá o fôlego do Vigor; encerrar zera; apagar apaga', async () => {
  setup();
  const chase = await createChase();
  chase.combatants.push({ id: 'p1', actor: actor('a1', 8) }, { id: 'p2', actor: null });
  await startChase(chase);
  assert.deepEqual(chase.calls.slice(-2), [
    [
      'updateEmbedded',
      'Combatant',
      [
        { _id: 'p1', system: participantStart(8) },
        { _id: 'p2', system: participantStart(4) },
      ],
    ],
    ['update', { system: startState() }],
  ]);
  await endChase(chase);
  assert.deepEqual(chase.calls.slice(-2), [
    [
      'updateEmbedded',
      'Combatant',
      [
        { _id: 'p1', system: participantReset() },
        { _id: 'p2', system: participantReset() },
      ],
    ],
    ['update', { system: endState() }],
  ]);
  await deleteChase(chase);
  assert.deepEqual(chase.calls.at(-1), ['delete']);
});

test('perseguição sem participantes: iniciar só muda o estado', async () => {
  setup();
  const chase = await createChase();
  await startChase(chase);
  assert.deepEqual(chase.calls, [['update', { system: startState() }]]);
});

test('perseguição: participantes entram (com fôlego se já começou) e saem', async () => {
  setup();
  const chase = await createChase();
  await addParticipants(chase, [actor('a1')]);
  assert.deepEqual(chase.calls.at(-1), [
    'createEmbedded',
    'Combatant',
    [{ type: 'participante', actorId: 'a1' }],
  ]);
  chase.system.ativa = true;
  await addParticipants(chase, [actor('a2', 10)]);
  assert.deepEqual(chase.calls.at(-1)[2], [
    { type: 'participante', actorId: 'a2', system: participantStart(10) },
  ]);
  chase.combatants[0].actorId = 'a1';
  assert.equal(actorParticipates(chase, { id: 'a1' }), true);
  assert.equal(actorParticipates(chase, { isToken: true, baseActor: { id: 'a1' } }), true);
  assert.equal(actorParticipates(chase, { id: 'zz' }), false);
  await addParticipants(chase, []);
  await removeParticipant(chase, 'p1');
  assert.deepEqual(chase.calls.at(-1), ['deleteEmbedded', 'Combatant', ['p1']]);
  // Jogador não mexe
  game.user = makeUser('p');
  const before = chase.calls.length;
  await startChase(chase);
  await endChase(chase);
  await deleteChase(chase);
  await addParticipants(chase, [actor('a3')]);
  await removeParticipant(chase, 'p2');
  assert.equal(chase.calls.length, before);
});

test('furtividade: só o mestre cria, sem cena, e só uma por vez', async () => {
  const created = setup();
  const stealth = await createStealth();
  assert.equal(findStealth(), stealth);
  assert.deepEqual(created, [{ type: 'furtividade', system: initialStealthState(), scene: null }]);
  assert.equal(await createStealth(), null);
  assert.deepEqual(log.warnings, ['DESORDEM.Furtividade.Erro.JaExiste']);
  const fallback = setup({ rejectNoScene: true });
  const original = console.warn;
  console.warn = () => {};
  try {
    assert.ok(await createStealth());
  } finally {
    console.warn = original;
  }
  assert.deepEqual(fallback, [{ type: 'furtividade', system: initialStealthState() }]);
});

test('furtividade: iniciar e encerrar zeram os dados e escondem o que estava revelado', async () => {
  setup();
  const stealth = await createStealth();
  stealth.combatants.push({ id: 'p1', actorId: 'a1' });
  const revealedNow = () => isRevealed('p1');
  // Revelar pelo próprio módulo não é exportado; o estado começa escondido
  assert.equal(revealedNow(), false);
  await startStealth(stealth);
  assert.deepEqual(stealth.calls, [
    ['updateEmbedded', 'Combatant', [{ _id: 'p1', system: stealthParticipantReset() }]],
    ['update', { system: stealthStartState() }],
  ]);
  await endStealth(stealth);
  assert.deepEqual(stealth.calls.slice(-2), [
    ['updateEmbedded', 'Combatant', [{ _id: 'p1', system: stealthParticipantReset() }]],
    ['update', { system: stealthEndState() }],
  ]);
  assert.equal(combatantOf(stealth, { id: 'a1' })?.id, 'p1');
  assert.equal(combatantOf(stealth, { isToken: true, baseActor: { id: 'a1' } })?.id, 'p1');
  assert.equal(combatantOf(stealth, null), undefined);
  hideRevealed();
  await deleteStealth(stealth);
  assert.deepEqual(stealth.calls.at(-1), ['delete']);
});

test('furtividade: participantes entram e saem (só pelo mestre)', async () => {
  setup();
  const stealth = await createStealth();
  await addStealthParticipants(stealth, [actor('a1')]);
  assert.deepEqual(stealth.calls.at(-1), [
    'createEmbedded',
    'Combatant',
    [{ type: 'furtivo', actorId: 'a1' }],
  ]);
  await removeStealthParticipant(stealth, 'p1');
  assert.deepEqual(stealth.calls.at(-1), ['deleteEmbedded', 'Combatant', ['p1']]);
  game.user = makeUser('p');
  const before = stealth.calls.length;
  await startStealth(stealth);
  await addStealthParticipants(stealth, [actor('a2')]);
  await deleteStealth(stealth);
  assert.equal(stealth.calls.length, before);
});
