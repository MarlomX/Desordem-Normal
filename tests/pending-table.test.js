import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLAIM_TIMEOUT_MS,
  createPending,
  tableDiceCount,
  isClaimable,
  nextTableState,
  tableView,
} from '../scripts/rolls/pending-table.js';
import { buildTableResultContext } from '../scripts/rolls/presenter.js';

const lesion = (extra = {}) => ({
  ...createPending({ kind: 'lesion', testNumber: 1, actorUuid: 'Actor.a' }),
  ...extra,
});

const RESULT = { key: 'semOlho', rolls: [11] };

test('createPending guarda o tipo, o teste e o personagem, começando pendente', () => {
  assert.deepEqual(createPending({ kind: 'trauma', testNumber: 2, actorUuid: 'Actor.b' }), {
    kind: 'trauma',
    status: 'pending',
    nonLethal: false,
    testNumber: 2,
    actorUuid: 'Actor.b',
    claimedAt: null,
    result: null,
  });
  assert.throws(() => createPending({ kind: 'x', testNumber: 1, actorUuid: 'a' }), RangeError);
});

test('dano não letal só vale para a lesão e põe 2 d20 na janela', () => {
  const nonLethal = createPending({
    kind: 'lesion',
    nonLethal: true,
    testNumber: 1,
    actorUuid: 'a',
  });
  assert.equal(tableDiceCount(nonLethal), 2);
  assert.equal(tableDiceCount(lesion()), 1);
  const trauma = createPending({ kind: 'trauma', nonLethal: true, testNumber: 1, actorUuid: 'a' });
  assert.equal(trauma.nonLethal, false);
  assert.equal(tableDiceCount(trauma), 1);
});

test('pendente pode ser reservado; reservado não, até a reserva ficar velha', () => {
  const now = 1_000_000;
  assert.equal(isClaimable(lesion(), now), true);
  const rolling = lesion({ status: 'rolling', claimedAt: now });
  assert.equal(isClaimable(rolling, now + 1000), false);
  assert.equal(isClaimable(rolling, now + CLAIM_TIMEOUT_MS + 1), true);
  assert.equal(isClaimable(lesion({ status: 'rolled' }), now + 10 * CLAIM_TIMEOUT_MS), false);
});

test('o ciclo pending → rolling → rolled grava o que deve', () => {
  const now = 5000;
  const claim = nextTableState(lesion(), { status: 'rolling' }, now);
  assert.deepEqual(claim, { status: 'rolling', claimedAt: now, result: null });

  const rolling = lesion(claim);
  assert.deepEqual(nextTableState(rolling, { status: 'rolled', result: RESULT }, now + 1), {
    status: 'rolled',
    result: RESULT,
  });
});

test('uma segunda reserva é recusada (duplo clique) e rolada é definitivo', () => {
  const now = 5000;
  const rolling = lesion({ status: 'rolling', claimedAt: now });
  assert.equal(nextTableState(rolling, { status: 'rolling' }, now + 10), null);
  const rolled = lesion({ status: 'rolled', result: RESULT });
  for (const status of ['rolling', 'pending']) {
    assert.equal(nextTableState(rolled, { status }, now), null);
  }
  assert.equal(nextTableState(rolled, { status: 'rolled', result: RESULT }, now), null);
});

test('erro na rolagem desfaz a reserva; só dá para marcar rolada depois de reservar', () => {
  const rolling = lesion({ status: 'rolling', claimedAt: 1 });
  assert.deepEqual(nextTableState(rolling, { status: 'pending' }, 2), {
    status: 'pending',
    claimedAt: null,
  });
  assert.equal(nextTableState(lesion(), { status: 'rolled', result: RESULT }, 2), null);
  assert.equal(nextTableState(lesion(), { status: 'pending' }, 2), null);
});

test('resultados malformados e pedidos estranhos são recusados', () => {
  const rolling = lesion({ status: 'rolling', claimedAt: 1 });
  const bad = [
    undefined,
    { key: '', rolls: [3] },
    { key: 'a', rolls: [] },
    { key: 'a', rolls: [21] },
    { key: 'a', rolls: [0] },
    { key: 'a', rolls: [1.5] },
    { key: 'a', rolls: 'x' },
    { key: 7, rolls: [3] },
    { key: 'a', rolls: Array(41).fill(3) },
  ];
  for (const result of bad) {
    assert.equal(nextTableState(rolling, { status: 'rolled', result }, 2), null);
  }
  assert.equal(nextTableState(rolling, { status: 'explodiu' }, 2), null);
  assert.equal(nextTableState(rolling, null, 2), null);
  assert.equal(nextTableState(null, { status: 'rolling' }, 2), null);
});

test('o resultado guardado é uma cópia (não compartilha o array de entrada)', () => {
  const rolls = [4, 9];
  const rolling = lesion({ status: 'rolling', claimedAt: 1 });
  const patch = nextTableState(rolling, { status: 'rolled', result: { key: 'a', rolls } }, 2);
  rolls.push(1);
  assert.deepEqual(patch.result.rolls, [4, 9]);
});

test('o cartão mostra o botão só ao dono e uma nota nos outros casos', () => {
  const now = 100;
  assert.deepEqual(tableView(lesion(), { isOwner: true, now }), {
    showButton: true,
    noteKey: null,
  });
  assert.deepEqual(tableView(lesion(), { isOwner: false, now }), {
    showButton: false,
    noteKey: 'waiting',
  });
  const rolling = lesion({ status: 'rolling', claimedAt: now });
  assert.deepEqual(tableView(rolling, { isOwner: true, now: now + 1 }), {
    showButton: false,
    noteKey: 'rolling',
  });
  assert.equal(
    tableView(rolling, { isOwner: true, now: now + CLAIM_TIMEOUT_MS + 1 }).showButton,
    true,
  );
  assert.deepEqual(tableView(lesion({ status: 'rolled' }), { isOwner: true, now }), {
    showButton: false,
    noteKey: 'rolled',
  });
});

test('o cartão de resultado monta as chaves de idioma de lesão e de trauma', () => {
  const lesao = buildTableResultContext({
    kind: 'lesion',
    entry: { key: 'semOlho' },
    rolls: [11, 14],
    testNumber: 3,
    nonLethal: true,
  });
  assert.equal(lesao.titleKey, 'DESORDEM.Tabela.Titulo.lesion');
  assert.equal(lesao.rollsLabelKey, 'DESORDEM.Lesao.RolagensTabela');
  assert.equal(lesao.nameKey, 'DESORDEM.Lesoes.semOlho.Nome');
  assert.equal(lesao.descriptionKey, 'DESORDEM.Lesoes.semOlho.Descricao');
  assert.deepEqual([lesao.hasRolls, lesao.nonLethal, lesao.testNumber], [true, true, 3]);

  const trauma = buildTableResultContext({
    kind: 'trauma',
    entry: { key: 'panico' },
    rolls: [16],
    testNumber: 1,
    nonLethal: true,
  });
  assert.equal(trauma.nameKey, 'DESORDEM.Traumas.panico.Nome');
  assert.equal(trauma.nonLethal, false); // dano não letal não existe na tabela de traumas
  assert.throws(
    () => buildTableResultContext({ kind: 'x', entry: { key: 'a' }, testNumber: 1 }),
    RangeError,
  );
});
