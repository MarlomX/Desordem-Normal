// Catálogo de efeitos das habilidades: normalização, parâmetros e números de formulário.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ANALISE_MAX,
  COSTS,
  EFFECT_TYPES,
  IMPETO_MAX,
  addResource,
  canPay,
  collectEffects,
  defaultParams,
  dialogDiceOptions,
  effectKey,
  halfOrLess,
  itemEffects,
  legacyEffects,
  normalizeCost,
  normalizeEffect,
  normalizeEffects,
  payUpdates,
  resourceDefs,
  resourceValue,
  roundLimitOk,
  sceneResources,
  triggerChanges,
} from '../scripts/rolls/ability-effects.js';
import { AUTOMATIONS, activeBoosts } from '../scripts/rolls/abilities.js';
import { buildRollModel } from '../scripts/rolls/roll-dialog.js';

const ability = (id, name, system) => ({ id, name, type: 'habilidade', system });
const legacyActor = (...keys) =>
  collectEffects(keys.map((key, i) => ability(`i${i}`, key, { automacao: key, efeitos: [] })));

// ---------- Catálogo ----------

test('normalizeEffect recusa tipos fora do catálogo e completa os parâmetros', () => {
  assert.equal(normalizeEffect({ id: 'x', tipo: 'magia', params: {} }), null);
  assert.equal(normalizeEffect(null), null);
  const effect = normalizeEffect({ id: 'x', tipo: 'dadoExtra' });
  assert.deepEqual(effect, { id: 'x', tipo: 'dadoExtra', params: defaultParams('dadoExtra') });
  assert.deepEqual(effect.params.custo, { tipo: 'nenhum', valor: 0, recurso: '' });
});

test('normalizeEffect troca valores inválidos pelo padrão e descarta parâmetros desconhecidos', () => {
  const effect = normalizeEffect({
    id: 'x',
    tipo: 'dadoExtra',
    params: { dado: 7, teste: 'magia', marcado: 'sim', pericias: ['crime', 3, 'crime'], extra: 1 },
  });
  assert.equal(effect.params.dado, 6);
  assert.equal(effect.params.teste, 'qualquer');
  assert.equal(effect.params.marcado, false);
  assert.deepEqual(effect.params.pericias, ['crime']);
  assert.equal('extra' in effect.params, false);
});

test('números de formulário: texto vira número, vazio fica o padrão, fora da faixa é limitado', () => {
  const rec = (maximo) => normalizeEffect({ id: 'r', tipo: 'recurso', params: { maximo } });
  assert.equal(rec('8').params.maximo, 8);
  assert.equal(rec('').params.maximo, 5);
  assert.equal(rec(99).params.maximo, 20);
  assert.equal(rec(0).params.maximo, 1);
  assert.equal(normalizeEffect({ tipo: 'dadoExtra', params: { dado: '10' } }).params.dado, 10);
});

test('normalizeCost: sem custo zera tudo; o recurso só fica no custo de recurso', () => {
  assert.deepEqual(normalizeCost({ tipo: 'nenhum', valor: 3, recurso: 'a' }), {
    tipo: 'nenhum',
    valor: 0,
    recurso: '',
  });
  assert.deepEqual(normalizeCost({ tipo: 'pd', valor: '2', recurso: 'a' }), {
    tipo: 'pd',
    valor: 2,
    recurso: '',
  });
  assert.deepEqual(normalizeCost({ tipo: 'recurso', valor: 1, recurso: 'impeto' }), {
    tipo: 'recurso',
    valor: 1,
    recurso: 'impeto',
  });
  assert.equal(normalizeCost(undefined).tipo, 'nenhum');
});

test('normalizeEffects tira os tipos desconhecidos e dá id a quem não tem', () => {
  const list = normalizeEffects([
    { tipo: 'acaoNota' },
    { tipo: 'nada' },
    { id: 'b', tipo: 'companheiro' },
  ]);
  assert.deepEqual(
    list.map((e) => e.id),
    ['e0', 'b'],
  );
  assert.deepEqual(normalizeEffects('lixo'), []);
});

test('defaultParams devolve cópias novas (mudar uma não muda o catálogo)', () => {
  const a = defaultParams('dadoExtra');
  a.pericias.push('crime');
  a.custo.valor = 9;
  assert.deepEqual(defaultParams('dadoExtra').pericias, []);
  assert.equal(defaultParams('dadoExtra').custo.valor, 0);
  assert.equal(defaultParams('nada'), null);
});

test('todo tipo do catálogo tem padrões que passam pela própria limpeza sem mudar', () => {
  for (const tipo of Object.keys(EFFECT_TYPES)) {
    const params = defaultParams(tipo);
    assert.deepEqual(normalizeEffect({ id: 'x', tipo, params }).params, params, tipo);
  }
});

// ---------- Automações antigas ----------

test('toda automação antiga vira efeitos (e uma chave desconhecida, nenhum)', () => {
  for (const key of AUTOMATIONS) assert.ok(legacyEffects(key).length > 0, key);
  assert.deepEqual(legacyEffects(''), []);
  assert.deepEqual(legacyEffects('outra'), []);
});

test('ímpeto antigo: barra de 5, enche ao falhar e ao perder o oposto, +d4 por 1, passo e ação por 3', () => {
  const list = legacyEffects('impeto');
  const by = (id) => list.find((e) => e.id === id);
  assert.deepEqual(by('impetoBarra').params, {
    chave: 'impeto',
    nome: '',
    maximo: IMPETO_MAX,
    esvazia: true,
  });
  assert.equal(by('impetoFalha').params.gatilho, 'falha');
  assert.equal(by('impetoOposto').params.gatilho, 'perdeOposto');
  assert.equal(by('impetoDado').params.dado, 4);
  assert.deepEqual(by('impetoDado').params.custo, {
    tipo: 'recurso',
    valor: COSTS.impetoDado,
    recurso: 'impeto',
  });
  assert.equal(by('impetoPasso').params.custo.valor, COSTS.impetoPasso);
  assert.equal(by('impetoPasso').params.atributo, '');
  assert.equal(by('impetoAcao').params.custo.valor, COSTS.impetoAcao);
});

test('outras automações antigas mantêm os números de antes', () => {
  const one = (key) => legacyEffects(key);
  const analise = one('analise');
  assert.equal(analise.find((e) => e.tipo === 'recurso').params.maximo, ANALISE_MAX);
  assert.deepEqual(analise.find((e) => e.tipo === 'ganharRecurso').params, {
    recurso: 'analise',
    quantidade: 2,
    gatilho: 'acao',
    rotulo: '',
  });
  assert.equal(analise.find((e) => e.tipo === 'ajusteDados').params.recurso, 'analise');
  assert.deepEqual(one('prontidao')[0].params, {
    custo: { tipo: 'pd', valor: COSTS.prontidao, recurso: '' },
    limite: 'rodadaCombate',
  });
  assert.equal(one('esquiva')[0].params.pericia, 'acrobacia');
  assert.deepEqual(one('companheiro')[0].params, { dado: 6, teste: 'ataqueCorpo' });
  const cura = one('curandeiro')[0].params;
  assert.deepEqual(
    [cura.custo.valor, cura.pericia, cura.dt, cura.resultado, cura.umaVezPorAlvo],
    [COSTS.curandeiro, 'medicina', 7, 'curarPV', true],
  );
  const furtivo = one('sorrateiro')[0].params;
  assert.deepEqual(
    [furtivo.dado, furtivo.pericias, furtivo.custo.valor],
    [8, ['crime', 'furtividade'], 3],
  );
  assert.deepEqual(one('impetoInicial')[0].params, {
    recurso: 'impeto',
    quantidade: 1,
    gatilho: 'inicioCena',
    rotulo: '',
  });
});

test('itemEffects: a lista própria vence; vazia, vale a automação antiga', () => {
  const own = itemEffects({ automacao: 'impeto', efeitos: [{ id: 'a', tipo: 'acaoNota' }] });
  assert.deepEqual(
    own.map((e) => e.id),
    ['a'],
  );
  assert.equal(itemEffects({ automacao: 'prontidao', efeitos: [] })[0].tipo, 'rerrolar');
  assert.equal(itemEffects({ automacao: 'prontidao' })[0].tipo, 'rerrolar');
  assert.deepEqual(itemEffects({ automacao: '', efeitos: [] }), []);
  assert.deepEqual(itemEffects(undefined), []);
});

test('collectEffects junta os efeitos das habilidades com o item de origem', () => {
  const entries = collectEffects([
    ability('a', 'Barra', { automacao: 'analise', efeitos: [] }),
    { id: 'w', name: 'Arma', type: 'arma', system: { automacao: 'impeto' } },
  ]);
  assert.equal(entries.length, 3);
  assert.ok(entries.every((e) => e.itemId === 'a' && e.itemName === 'Barra'));
  assert.equal(effectKey(entries[0]), 'a-analiseMarcadores');
  assert.deepEqual(collectEffects(undefined), []);
});

// ---------- Recursos ----------

test('resourceDefs: o primeiro recurso de cada chave vale; sem nome, o nome da habilidade', () => {
  const entries = collectEffects([
    ability('a', 'Fúria', {
      efeitos: [
        { id: 'r1', tipo: 'recurso', params: { chave: 'furia', maximo: 3 } },
        { id: 'r2', tipo: 'recurso', params: { chave: 'furia', maximo: 9 } },
        { id: 'r3', tipo: 'recurso', params: { chave: '', maximo: 2 } },
      ],
    }),
  ]);
  const defs = resourceDefs(entries);
  assert.deepEqual(Object.keys(defs), ['furia']);
  assert.equal(defs.furia.maximo, 3);
  assert.equal(defs.furia.nome, 'Fúria');
});

test('resourceValue e addResource ficam entre 0 e o máximo; recurso desconhecido vale 0', () => {
  const defs = resourceDefs(legacyActor('impeto'));
  assert.equal(resourceValue({ impeto: 9 }, defs, 'impeto'), IMPETO_MAX);
  assert.equal(resourceValue({ impeto: -2 }, defs, 'impeto'), 0);
  assert.equal(resourceValue({}, defs, 'impeto'), 0);
  assert.equal(resourceValue({ outro: 3 }, defs, 'outro'), 0);
  assert.equal(addResource({ impeto: 4 }, defs, 'impeto', 3), IMPETO_MAX);
  assert.equal(addResource({ impeto: 1 }, defs, 'impeto', -3), 0);
});

test('triggerChanges: falhar enche o ímpeto em 1 (até 5); sem a barra, nada muda', () => {
  const entries = legacyActor('impeto');
  assert.deepEqual(triggerChanges(entries, { impeto: 2 }, 'falha'), { impeto: 3 });
  assert.deepEqual(triggerChanges(entries, { impeto: 2 }, 'perdeOposto'), { impeto: 3 });
  assert.deepEqual(triggerChanges(entries, { impeto: 5 }, 'falha'), {});
  assert.deepEqual(triggerChanges(entries, { impeto: 2 }, 'inicioCombate'), {});
  // Ímpeto inicial sem a barra de ímpeto: o ganho não tem onde cair
  assert.deepEqual(triggerChanges(legacyActor('impetoInicial'), {}, 'inicioCena'), {});
});

test('triggerChanges com item: o botão de ação de uma habilidade só dispara os ganhos dela', () => {
  const entries = legacyActor('analise', 'impeto');
  assert.deepEqual(triggerChanges(entries, { analise: 3 }, 'acao', 'i0'), { analise: 4 });
  assert.deepEqual(triggerChanges(entries, { analise: 3 }, 'acao', 'i1'), {});
});

test('sceneResources: esvazia o que esvazia e soma os ganhos de início de cena', () => {
  assert.deepEqual(sceneResources(legacyActor('impeto', 'analise'), { impeto: 4, analise: 3 }), {
    impeto: 0,
    analise: 0,
  });
  assert.deepEqual(sceneResources(legacyActor('impeto', 'impetoInicial'), { impeto: 4 }), {
    impeto: 1,
  });
  const keep = collectEffects([
    ability('a', 'Reserva', {
      efeitos: [{ id: 'r', tipo: 'recurso', params: { chave: 'fe', maximo: 3, esvazia: false } }],
    }),
  ]);
  assert.deepEqual(sceneResources(keep, { fe: 2 }), { fe: 2 });
  assert.deepEqual(sceneResources([], { impeto: 3 }), {});
});

// ---------- Custos ----------

test('canPay e payUpdates para PD, PV, recurso e sem custo', () => {
  const wallet = { pd: 3, pv: 5, recursos: { impeto: 2 } };
  assert.equal(canPay({ tipo: 'pd', valor: 3 }, wallet), true);
  assert.equal(canPay({ tipo: 'pd', valor: 4 }, wallet), false);
  assert.equal(canPay({ tipo: 'pv', valor: 6 }, wallet), false);
  assert.equal(canPay({ tipo: 'recurso', valor: 3, recurso: 'impeto' }, wallet), false);
  assert.equal(canPay({ tipo: 'recurso', valor: 1, recurso: 'outro' }, wallet), false);
  assert.equal(canPay({ tipo: 'nenhum', valor: 9 }, wallet), true);
  assert.deepEqual(payUpdates({ tipo: 'pd', valor: 2 }, wallet), { 'system.pd.value': 1 });
  assert.deepEqual(payUpdates({ tipo: 'pv', valor: 2 }, wallet), { 'system.pv.value': 3 });
  assert.deepEqual(payUpdates({ tipo: 'recurso', valor: 1, recurso: 'impeto' }, wallet), {
    'system.recursosHab.impeto': 1,
  });
  assert.deepEqual(payUpdates({ tipo: 'nenhum' }, wallet), {});
});

// ---------- Janela pré-teste ----------

test('dialogDiceOptions: furtivo só em Crime e Furtividade; ímpeto em qualquer perícia', () => {
  const entries = legacyActor('impeto', 'sorrateiro');
  assert.deepEqual(
    dialogDiceOptions(entries, { skillKey: 'crime' }).map((o) => [o.key, o.die, o.cost]),
    [
      ['impetoDado', 4, { pd: 0, pv: 0, recursos: { impeto: 1 } }],
      ['sorrateiro', 8, { pd: 3, pv: 0, recursos: {} }],
    ],
  );
  assert.deepEqual(
    dialogDiceOptions(entries, { skillKey: 'luta' }).map((o) => o.key),
    ['impetoDado'],
  );
});

test('dialogDiceOptions filtra pelo tipo de teste, ignora repetidos e aceita qualquer custo', () => {
  const entries = collectEffects([
    ability('a', 'Escudo', {
      efeitos: [
        { id: 'd1', tipo: 'dadoExtra', params: { dado: 6, teste: 'defesa' } },
        { id: 'd1', tipo: 'dadoExtra', params: { dado: 12 } },
        { id: 'd2', tipo: 'dadoExtra', params: { custo: { tipo: 'pv', valor: 1 } } },
        {
          id: 'd3',
          tipo: 'dadoExtra',
          params: { custo: { tipo: 'recurso', valor: 1, recurso: 'fe' } },
        },
        { id: 'd4', tipo: 'dadoExtra', params: { grupo: 'acao', marcado: true } },
      ],
    }),
  ]);
  const options = dialogDiceOptions(entries, { skillKey: 'luta' });
  assert.deepEqual(
    options.map((o) => [o.key, o.cost]),
    [
      ['d1', { pd: 0, pv: 0, recursos: {} }],
      ['d2', { pd: 0, pv: 1, recursos: {} }],
      ['d3', { pd: 0, pv: 0, recursos: { fe: 1 } }],
      ['d4', { pd: 0, pv: 0, recursos: {} }],
    ],
  );
  assert.equal(options[0].die, 12);
  assert.equal(dialogDiceOptions(entries, { skillKey: 'luta', testKind: 'defesa' })[0].die, 6);
  const last = options[3];
  assert.deepEqual([last.group, last.checked, last.itemName], ['acao', true, 'Escudo']);
});

// Os dois testes abaixo comparavam os efeitos antigos com o atalho `has` da janela, removido na
// v0.28.0. Os valores esperados são os que o atalho dava (conferidos na v0.27.3).
test('equivalência: a janela pré-teste com os efeitos antigos dá as mesmas opções de antes', () => {
  const base = {
    attrDie: 8,
    skillDie: 6,
    resources: { impeto: 1, pd: 2 },
  };
  const impeto = {
    key: 'impetoDado',
    die: 4,
    cost: { pd: 0, pv: 0, recursos: { impeto: 1 } },
    available: true,
    reason: null,
  };
  const sorrateiro = {
    key: 'sorrateiro',
    die: 8,
    cost: { pd: 3, pv: 0, recursos: {} },
    available: false,
    reason: 'pd',
  };
  const expected = { furtividade: [impeto, sorrateiro], luta: [impeto] };
  for (const skillKey of ['furtividade', 'luta']) {
    const after = buildRollModel({
      ...base,
      skillKey,
      diceOptions: dialogDiceOptions(legacyActor('impeto', 'sorrateiro'), { skillKey }),
    });
    const strip = (abilities) => abilities.map(({ itemName, ...rest }) => rest);
    assert.deepEqual(strip(after.abilities), expected[skillKey], skillKey);
  }
});

test('equivalência: activeBoosts com os efeitos antigos dá os mesmos dados e custos de antes', () => {
  const none = { extraDice: [], pdCost: 0, pvCost: 0, resourceCosts: {}, impetoCost: 0, used: [] };
  const cases = [
    [
      ['impetoDado'],
      'luta',
      2,
      0,
      {
        ...none,
        extraDice: [4],
        resourceCosts: { impeto: 1 },
        impetoCost: 1,
        used: ['impetoDado'],
      },
    ],
    [
      ['sorrateiro'],
      'furtividade',
      0,
      5,
      { ...none, extraDice: [8], pdCost: 3, used: ['sorrateiro'] },
    ],
    [['sorrateiro'], 'luta', 0, 5, none],
    [
      ['impetoDado', 'sorrateiro'],
      'crime',
      1,
      3,
      {
        ...none,
        extraDice: [4, 8],
        pdCost: 3,
        resourceCosts: { impeto: 1 },
        impetoCost: 1,
        used: ['impetoDado', 'sorrateiro'],
      },
    ],
    [['impetoDado'], 'luta', 0, 9, none],
  ];
  for (const [active, skillKey, impeto, pd, expected] of cases) {
    const diceOptions = dialogDiceOptions(legacyActor('impeto', 'sorrateiro'), { skillKey });
    assert.deepEqual(activeBoosts(active, { pd, recursos: { impeto }, diceOptions }), {
      ...expected,
      companionAt: null,
    });
  }
});

// ---------- Limites ----------

test('roundLimitOk: fora de combate sem limite; uma vez por rodada no mesmo combate', () => {
  const now = { combate: 'c1', rodada: 2 };
  assert.equal(roundLimitOk(undefined, null), true);
  assert.equal(roundLimitOk({ combate: 'c1', rodada: 2 }, null), true);
  assert.equal(roundLimitOk(undefined, now), true);
  assert.equal(roundLimitOk({ combate: 'c1', rodada: 2 }, now), false);
  assert.equal(roundLimitOk({ combate: 'c1', rodada: 1 }, now), true);
  assert.equal(roundLimitOk({ combate: 'c0', rodada: 2 }, now), true);
});

test('halfOrLess: metade ou menos do máximo (15 de máximo: vale com 7, não com 8)', () => {
  assert.equal(halfOrLess(7, 15), true);
  assert.equal(halfOrLess(8, 15), false);
  assert.equal(halfOrLess(10, 20), true);
  assert.equal(halfOrLess(0, 0), false);
});
