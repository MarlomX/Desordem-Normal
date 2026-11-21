import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bothRolled,
  cardType,
  defenseChoices,
  markDamage,
  validChoice,
  weaponChoices,
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
    highRoll: 0,
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

// ===== 0.19.4: combate, defesa e desempate pela RA =====

const dados = (values, crit = null) => ({
  total: values.reduce((sum, v) => sum + v, 0),
  dice: values.map((value) => ({ value })),
  highRoll: Math.max(...values),
  highSum: crit === 'success' ? values[0] + values[1] : Math.max(...values),
  criticalSuccess: crit === 'success',
  criticalFailure: false,
});
const espada = {
  id: 'w1',
  nome: 'Espada',
  bonusDano: 2,
  naoLetal: false,
  tipo: 'corpo',
  pericia: '',
};
const arco = {
  id: 'w2',
  nome: 'Arco',
  bonusDano: 1,
  naoLetal: false,
  tipo: 'distancia',
  pericia: '',
};
const garras = {
  id: 'w3',
  nome: 'Garras',
  bonusDano: 1,
  naoLetal: false,
  tipo: 'corpo',
  pericia: '',
};

test('simples: total igual decide pela RA; RA igual continua empate (repetem)', () => {
  const base = {
    ...createOpposedState({ a: A, b: B }),
    a: { ...A, papel: 'pericia', arma: null, testId: 'm1' },
    b: { ...B, papel: 'pericia', arma: null, skill: 'luta', testId: 'm2' },
  };
  const ra = resolveState(base, dados([6, 2]), dados([4, 4]));
  assert.equal(ra.estado, 'resolvido');
  assert.equal(ra.resultado.winner, 'a');
  assert.equal(buildOpposedCardContext(ra).porRA, true);
  assert.equal(resolveState(base, dados([6, 2]), dados([6, 1, 1])).estado, 'empate');
});

test('cartões antigos (sem tipo nem papel) continuam sendo simples', () => {
  assert.equal(cardType({ estado: 'aberto' }), 'simples');
  assert.equal(cardType({ tipo: 'xyz' }), 'simples');
});

test('validChoice confere a escolha de cada papel', () => {
  assert.equal(validChoice('simples', 'pericia', { skill: 'luta' }), true);
  assert.equal(validChoice('simples', 'pericia', {}), false);
  assert.equal(validChoice('corpo', 'ataque', { skill: 'luta', arma: espada }), true);
  assert.equal(validChoice('corpo', 'ataque', { skill: 'pontaria', arma: arco }), false);
  assert.equal(validChoice('defesa', 'ataque', { skill: 'pontaria', arma: arco }), true);
  // A perícia do ataque é a da arma
  assert.equal(validChoice('defesa', 'ataque', { skill: 'luta', arma: arco }), false);
  assert.equal(validChoice('defesa', 'defesa', { skill: 'acrobacia' }), true);
  assert.equal(validChoice('defesa', 'defesa', { skill: 'luta' }), true);
  assert.equal(validChoice('defesa', 'defesa', { skill: 'atletismo' }), false);
});

test('corpo a corpo: os dois lados atacam; empate acerta os dois com o dano de cada arma', () => {
  let state = createOpposedState({
    tipo: 'corpo',
    a: { ...A, skill: 'luta', arma: espada },
    b: { actorUuid: 'Actor.b', nome: 'Bruxa' },
  });
  assert.equal(state.a.papel, 'ataque');
  assert.equal(state.b.papel, 'ataque');
  assert.equal(state.a.arma.nome, 'Espada');
  assert.throws(
    () => createOpposedState({ tipo: 'corpo', a: { ...A, skill: 'pontaria', arma: arco } }),
    RangeError,
  );
  state = registerSide(state, 'a', { ...A, skill: 'luta', arma: espada, testId: 'm1' });
  // O lado B não pode atacar à distância num cartão corpo a corpo
  assert.equal(
    registerSide(state, 'b', { actorUuid: 'Actor.b', skill: 'pontaria', arma: arco, testId: 'x' }),
    null,
  );
  state = registerSide(state, 'b', {
    actorUuid: 'Actor.b',
    nome: 'Bruxa',
    skill: 'luta',
    skillLabel: 'Luta',
    arma: garras,
    testId: 'm2',
  });
  const empate = resolveState(state, dados([5, 3]), dados([6, 2]));
  assert.equal(empate.estado, 'resolvido');
  assert.deepEqual(empate.dano.a, { valor: 7, naoLetal: false, estado: 'pendente', por: '' });
  assert.deepEqual(empate.dano.b, { valor: 7, naoLetal: false, estado: 'pendente', por: '' });
  const ctx = buildOpposedCardContext(empate);
  assert.equal(ctx.acertos.length, 2);
  assert.equal(ctx.acertos[0].alvo, 'Bruxa');
  // Ninguém atinge 7: ninguém acerta
  const erro = resolveState(state, dados([3, 3]), dados([2, 2]));
  assert.deepEqual(erro.dano, { a: null, b: null });
  assert.equal(buildOpposedCardContext(erro).ninguemAcerta, true);
});

test('defesa: quem propõe se defende; o ataque precisa vencer; o dano aplicado fica', () => {
  let state = createOpposedState({
    tipo: 'defesa',
    a: { ...A, papel: 'defesa', skill: 'acrobacia', skillLabel: 'Acrobacia' },
    b: { actorUuid: 'Actor.b', nome: 'Bruxa' },
  });
  assert.equal(state.a.papel, 'defesa');
  assert.equal(state.b.papel, 'ataque');
  state = registerSide(state, 'a', { ...A, skill: 'acrobacia', testId: 'm1' });
  state = registerSide(state, 'b', {
    actorUuid: 'Actor.b',
    nome: 'Bruxa',
    skill: 'pontaria',
    skillLabel: 'Pontaria',
    arma: arco,
    testId: 'm2',
  });
  const acerta = resolveState(state, dados([3, 2, 1]), dados([5, 4]));
  assert.equal(acerta.resultado.winner, 'b');
  assert.deepEqual(acerta.dano.b, { valor: 6, naoLetal: false, estado: 'pendente', por: '' });
  assert.equal(acerta.dano.a, null);
  // Marca o dano aplicado; recalcular (análise virou a defesa) não apaga o que já foi aplicado
  const aplicado = markDamage(acerta, 'b', 'u1');
  assert.equal(aplicado.dano.b.estado, 'aplicado');
  assert.equal(markDamage(aplicado, 'b', 'u1'), null);
  assert.equal(markDamage(acerta, 'a', 'u1'), null);
  const virou = resolveState(aplicado, dados([6, 6, 1]), dados([5, 4]));
  assert.equal(virou.resultado.winner, 'a');
  assert.equal(virou.dano.b.estado, 'aplicado');
  // Defesa vence: nenhum dano pendente e o cartão diz que a defesa venceu
  const defendeu = resolveState(state, dados([6, 6, 1]), dados([5, 4]));
  assert.deepEqual(defendeu.dano, { a: null, b: null });
  assert.equal(buildOpposedCardContext(defendeu).defesaVenceu, true);
  assert.equal(buildOpposedCardContext(defendeu).defensorNome, 'Ana');
  assert.equal(buildOpposedCardContext(defendeu).ninguemAcerta, false);
});

test('defesa com Luta contra ataque à distância fica marcada para o mestre decidir', () => {
  let state = createOpposedState({
    tipo: 'defesa',
    a: { ...A, papel: 'defesa', skill: 'luta', skillLabel: 'Luta' },
  });
  state = registerSide(state, 'a', { ...A, skill: 'luta', testId: 'm1' });
  state = registerSide(state, 'b', {
    actorUuid: 'Actor.z',
    nome: 'Zé',
    skill: 'pontaria',
    arma: arco,
    testId: 'm2',
  });
  const ctx = buildOpposedCardContext(resolveState(state, dados([4, 4]), dados([5, 4])));
  assert.equal(ctx.lutaContraDistancia, true);
});

test('weaponChoices e defenseChoices oferecem só o que serve para o cartão', () => {
  const items = [
    { id: 'w2', name: 'Arco', type: 'arma', system: { tipo: 'distancia', bonusDano: 1 } },
    { id: 'w1', name: 'Espada', type: 'arma', system: { tipo: 'corpo', bonusDano: 2 } },
    { id: 'h', name: 'Uivo', type: 'habilidade', system: {} },
  ];
  assert.deepEqual(
    weaponChoices(items, 'corpo').map((w) => w.nome),
    ['Espada'],
  );
  assert.deepEqual(
    weaponChoices(items, 'defesa').map((w) => w.nome),
    ['Arco', 'Espada'],
  );
  assert.deepEqual(defenseChoices(null), [
    { key: 'acrobacia', soCorpo: false },
    { key: 'luta', soCorpo: true },
  ]);
  assert.deepEqual(
    defenseChoices({ tipo: 'distancia' }).map((c) => c.key),
    ['acrobacia'],
  );
  assert.deepEqual(defenseChoices({ tipo: 'corpo' })[1], { key: 'luta', soCorpo: false });
});

// ===== 0.20.6: esquiva livre no lado da defesa =====

test('esquiva: a defesa livre aceita a perícia do efeito; Defender-se continua Acrobacia ou Luta', () => {
  assert.equal(validChoice('defesa', 'defesa', { skill: 'atletismo', esquiva: true }), true);
  assert.equal(validChoice('defesa', 'defesa', { skill: '', esquiva: true }), false);
  assert.equal(validChoice('defesa', 'defesa', { skill: 'atletismo' }), false);
  // `esquiva` só muda o lado da defesa
  assert.equal(validChoice('simples', 'pericia', { skill: 'crime', esquiva: true }), true);
});

test('esquiva: registra o lado como esquiva, mesmo com outra perícia escolhida na proposta', () => {
  const arco = { id: 'w1', nome: 'Arco', bonusDano: 1, tipo: 'distancia', pericia: 'pontaria' };
  const state = createOpposedState({
    tipo: 'defesa',
    a: { ...A, papel: 'ataque', skill: 'pontaria', arma: arco },
    b: { ...B, skill: 'luta', skillLabel: 'Luta' },
  });
  // Defender-se com outra perícia: recusado; esquiva com a perícia do efeito: aceita
  assert.equal(registerSide(state, 'b', { ...B, skill: 'acrobacia', testId: 'm2' }), null);
  const next = registerSide(state, 'b', {
    ...B,
    skill: 'acrobacia',
    skillLabel: 'Acrobacia',
    testId: 'm2',
    esquiva: true,
  });
  assert.equal(next.b.esquiva, true);
  assert.equal(next.b.skill, 'acrobacia');
  assert.equal(buildOpposedCardContext(next).b.esquiva, true);
  // O ataque nunca vira esquiva
  assert.equal(
    registerSide(state, 'a', { ...A, skill: 'pontaria', arma: arco, testId: 'm1', esquiva: true }).a
      .esquiva,
    false,
  );
  // Cartões antigos (sem o campo) continuam sem esquiva
  assert.equal(buildOpposedCardContext(state).b.esquiva, false);
});

test('esquiva: o lado guarda o nome da habilidade (só na esquiva)', () => {
  const arco = { id: 'w1', nome: 'Arco', bonusDano: 1, tipo: 'distancia', pericia: 'pontaria' };
  const state = createOpposedState({
    tipo: 'defesa',
    a: { ...A, papel: 'ataque', skill: 'pontaria', arma: arco },
    b: { ...B },
  });
  const dodge = registerSide(state, 'b', {
    ...B,
    skill: 'acrobacia',
    testId: 'm2',
    esquiva: true,
    esquivaNome: 'Passo do Lobo',
  });
  assert.equal(buildOpposedCardContext(dodge).b.esquivaNome, 'Passo do Lobo');
  const defend = registerSide(state, 'b', { ...B, skill: 'acrobacia', testId: 'm2', esquivaNome: 'X' });
  assert.equal(defend.b.esquivaNome, '');
});

test('Guardião: assume o dano pendente da defesa, que continua com ele no recálculo', async () => {
  const { assignGuardian, damageTargetUuid } = await import('../scripts/rolls/opposed-card.js');
  let state = createOpposedState({
    tipo: 'defesa',
    a: { ...A, papel: 'defesa', skill: 'acrobacia', skillLabel: 'Acrobacia' },
    b: { actorUuid: 'Actor.b', nome: 'Bruxa' },
  });
  state = registerSide(state, 'a', { ...A, skill: 'acrobacia', testId: 'm1' });
  state = registerSide(state, 'b', {
    actorUuid: 'Actor.b',
    nome: 'Bruxa',
    skill: 'pontaria',
    arma: arco,
    testId: 'm2',
  });
  const acerta = resolveState(state, dados([3, 2, 1]), dados([5, 4]));
  assert.equal(damageTargetUuid(acerta, 'b'), 'Actor.a');
  const rowan = { actorUuid: 'Actor.r', nome: 'Rowan', habilidade: 'Guardião' };
  // Atacante e alvo não assumem; sem dano pendente, também não
  assert.equal(assignGuardian(acerta, 'b', { ...rowan, actorUuid: 'Actor.a' }), null);
  assert.equal(assignGuardian(acerta, 'b', { ...rowan, actorUuid: 'Actor.b' }), null);
  assert.equal(assignGuardian(acerta, 'a', rowan), null);
  const guarded = assignGuardian(acerta, 'b', rowan);
  assert.deepEqual(guarded.dano.b.guardiao, rowan);
  assert.equal(damageTargetUuid(guarded, 'b'), 'Actor.r');
  // Só um assume
  assert.equal(assignGuardian(guarded, 'b', { ...rowan, actorUuid: 'Actor.x' }), null);
  // Recalcular (outro valor de dano) mantém o Guardião; aplicar também
  const again = resolveState(guarded, dados([3, 2, 1]), dados([6, 4]));
  assert.equal(again.dano.b.guardiao.nome, 'Rowan');
  assert.equal(markDamage(again, 'b', 'u1').dano.b.guardiao.nome, 'Rowan');
  assert.equal(assignGuardian(markDamage(again, 'b', 'u1'), 'b', rowan), null);
  const ctx = buildOpposedCardContext(guarded);
  assert.equal(ctx.acertos[0].guardiaoNome, 'Rowan');
  assert.equal(ctx.acertos[0].guardiaoHabilidade, 'Guardião');
  assert.equal(buildOpposedCardContext(acerta).acertos[0].guardiaoNome, '');
});
