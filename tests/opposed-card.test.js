import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bothRolled,
  buildOpposedCardContext,
  canCancel,
  canRollSide,
  createOpposedState,
  loserSide,
  opposedSkillChoices,
  registerSide,
  repeatState,
  resolveState,
} from '../scripts/rolls/opposed-card.js';

const A = { actorUuid: 'Actor.a', nome: 'Ana', skill: 'atletismo', skillLabel: 'Atletismo' };
const B = { actorUuid: 'Actor.b', nome: 'Bruxa', skill: '', skillLabel: '' };
const res = (total, extra = {}) => ({
  total,
  criticalSuccess: false,
  criticalFailure: false,
  ...extra,
});

test('createOpposedState exige ator e perícia em A e recusa o mesmo ator nos dois lados', () => {
  const state = createOpposedState({ a: A, descricao: '  pegar a arma caída  ' });
  assert.equal(state.estado, 'aberto');
  assert.equal(state.descricao, 'pegar a arma caída');
  assert.equal(state.b.actorUuid, '');
  assert.equal(state.a.testId, '');
  assert.throws(() => createOpposedState({ a: { ...A, skill: '' } }), RangeError);
  assert.throws(() => createOpposedState({ a: A, b: { actorUuid: 'Actor.a' } }), RangeError);
  assert.equal(createOpposedState({ a: A, descricao: 'x'.repeat(500) }).descricao.length, 120);
});

test('canRollSide: lado aberto aceita qualquer outro ator; lado com alvo só aceita o alvo', () => {
  const aberto = createOpposedState({ a: A });
  assert.equal(canRollSide(aberto, 'a', 'Actor.a'), true);
  assert.equal(canRollSide(aberto, 'a', 'Actor.z'), false);
  assert.equal(canRollSide(aberto, 'b', 'Actor.z'), true);
  assert.equal(canRollSide(aberto, 'b', 'Actor.a'), false);
  const comAlvo = createOpposedState({ a: A, b: B });
  assert.equal(canRollSide(comAlvo, 'b', 'Actor.b'), true);
  assert.equal(canRollSide(comAlvo, 'b', 'Actor.z'), false);
  assert.equal(canRollSide(comAlvo, 'c', 'Actor.b'), false);
  assert.equal(canRollSide(comAlvo, 'b', ''), false);
});

test('registerSide grava o teste e não aceita registrar o mesmo lado duas vezes', () => {
  let state = createOpposedState({ a: A });
  const b = registerSide(state, 'b', {
    actorUuid: 'Actor.z',
    nome: 'Zé',
    skill: 'luta',
    skillLabel: 'Luta',
    testId: 'm2',
  });
  assert.equal(b.b.nome, 'Zé');
  assert.equal(b.b.testId, 'm2');
  assert.equal(registerSide(b, 'b', { actorUuid: 'Actor.z', testId: 'm3' }), null);
  assert.equal(registerSide(state, 'a', { actorUuid: 'Actor.a', testId: '' }), null);
  state = registerSide(b, 'a', { ...A, testId: 'm1' });
  assert.equal(bothRolled(state), true);
});

test('resolveState compara os dois lados; empate deixa o cartão em «empate»', () => {
  const pronto = { ...createOpposedState({ a: A, b: B }), a: { ...A, testId: 'm1' } };
  pronto.b = { ...B, skill: 'luta', testId: 'm2' };
  const ganhaA = resolveState(pronto, res(11), res(7));
  assert.equal(ganhaA.estado, 'resolvido');
  assert.equal(ganhaA.resultado.winner, 'a');
  assert.equal(ganhaA.resultado.margin, 4);
  assert.deepEqual(ganhaA.resultado.b, {
    total: 7,
    criticalSuccess: false,
    criticalFailure: false,
  });
  assert.equal(loserSide(ganhaA), 'b');
  const empate = resolveState(pronto, res(8), res(8));
  assert.equal(empate.estado, 'empate');
  assert.equal(loserSide(empate), null);
  // O crítico decide contra um total maior
  const critico = resolveState(pronto, res(14), res(12, { criticalSuccess: true }));
  assert.equal(critico.resultado.winner, 'b');
  assert.equal(critico.resultado.decidedBy, 'critical');
  // Recalcular (análise mudou um dado) vira o resultado
  assert.equal(resolveState(ganhaA, res(6), res(7)).resultado.winner, 'b');
});

test('resolveState não mexe em cartão sem os dois testes, cancelado ou repetido', () => {
  const metade = { ...createOpposedState({ a: A }), a: { ...A, testId: 'm1' } };
  assert.equal(resolveState(metade, res(5), res(6)), metade);
  const cancelado = { ...metade, b: { ...B, testId: 'm2' }, estado: 'cancelado' };
  assert.equal(resolveState(cancelado, res(5), res(6)), cancelado);
});

test('repeatState refaz o cartão com os mesmos atores e perícias, sem testes', () => {
  const feito = {
    ...createOpposedState({ a: A, descricao: 'arma' }),
    a: { ...A, testId: 'm1' },
    b: { actorUuid: 'Actor.z', nome: 'Zé', skill: 'luta', skillLabel: 'Luta', testId: 'm2' },
    estado: 'empate',
  };
  const novo = repeatState(feito);
  assert.equal(novo.estado, 'aberto');
  assert.equal(novo.b.actorUuid, 'Actor.z');
  assert.equal(novo.b.skill, 'luta');
  assert.equal(novo.a.testId, '');
  assert.equal(novo.b.testId, '');
  assert.equal(novo.descricao, 'arma');
});

test('canCancel só enquanto o cartão está aberto', () => {
  const state = createOpposedState({ a: A });
  assert.equal(canCancel(state), true);
  assert.equal(canCancel({ ...state, estado: 'resolvido' }), false);
});

test('opposedSkillChoices usa os grupos que a ficha tem (personagem ou criatura)', () => {
  const labels = {
    skill: (k) => k,
    aptitude: (k) => `Apt: ${k}`,
    craft: (k) => `Of: ${k}`,
    extra: (group, name) => `${group}: ${name || '?'}`,
  };
  const personagem = opposedSkillChoices(
    { aptidoes: {}, oficios: {}, aptidoesExtras: [{ id: 'x1', nome: 'Heráldica' }] },
    labels,
  );
  assert.ok(personagem.some((c) => c.key === 'luta'));
  assert.ok(personagem.some((c) => c.key === 'folclore' && c.label === 'Apt: folclore'));
  assert.ok(personagem.some((c) => c.key === 'aptidao:x1' && c.label === 'aptidao: Heráldica'));
  const criatura = opposedSkillChoices({ periciasExtras: [{ id: 'p1', nome: '' }] }, labels);
  assert.equal(
    criatura.some((c) => c.key === 'folclore'),
    false,
  );
  assert.ok(criatura.some((c) => c.key === 'pericia:p1' && c.label === 'pericia: ?'));
  assert.equal(criatura.length, 19);
  const nomes = criatura.map((c) => c.label);
  assert.deepEqual(
    nomes,
    [...nomes].sort((x, y) => x.localeCompare(y, 'pt-BR')),
  );
});

test('buildOpposedCardContext marca vencedor, perdedor, margem e lado aberto', () => {
  const state = {
    ...createOpposedState({ a: A, descricao: 'arma' }),
    a: { ...A, testId: 'm1' },
    b: { actorUuid: 'Actor.z', nome: 'Zé', skill: 'luta', skillLabel: 'Luta', testId: 'm2' },
  };
  const ctx = buildOpposedCardContext(resolveState(state, res(12), res(9)));
  assert.equal(ctx.resolvido, true);
  assert.equal(ctx.a.vencedor, true);
  assert.equal(ctx.b.perdedor, true);
  assert.equal(ctx.vencedorNome, 'Ana');
  assert.equal(ctx.margem, 3);
  assert.equal(ctx.b.total, 9);
  const aberto = buildOpposedCardContext(createOpposedState({ a: A }));
  assert.equal(aberto.b.aberto, true);
  assert.equal(aberto.a.rolou, false);
  assert.equal(aberto.a.total, null);
  assert.equal(aberto.a.temTotal, false);
  assert.equal(buildOpposedCardContext(resolveState(state, res(0), res(9))).a.temTotal, true);
  assert.equal(aberto.vencedorNome, '');
});
