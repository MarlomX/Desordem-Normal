import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  MAX_PIPS,
  abilityControls,
  adjustLabel,
  buttonLabel,
  isButtonEffect,
  resourceBars,
  resourceName,
} from '../scripts/sheets/ability-controls.js';
import {
  bonusDiceGranted,
  collectEffects,
  groupBonusDice,
  legacyEffects,
  normalizeEffect,
  triggerChanges,
} from '../scripts/rolls/ability-effects.js';
import { sceneReset } from '../scripts/rolls/abilities.js';

const pt = JSON.parse(fs.readFileSync(new URL('../lang/pt-BR.json', import.meta.url)));
const en = JSON.parse(fs.readFileSync(new URL('../lang/en.json', import.meta.url)));
const translator =
  (dict) =>
  (key, data = {}) => {
    let node = dict;
    for (const part of key.split('.')) node = node?.[part];
    if (typeof node !== 'string') throw new Error(`chave ausente: ${key}`);
    return node.replace(/\{(\w+)\}/g, (_, name) => {
      if (!(name in data)) throw new Error(`marcador sem valor: ${name} em ${key}`);
      return String(data[name]);
    });
  };
const t = translator(pt);
const skill = (key) => ({ medicina: 'Medicina', guerra: 'Aptidões: Guerra' })[key] ?? key;
const one = (tipo, params = {}, id = 'x') => normalizeEffect({ id, tipo, params });
const ability = (id, name, efeitos, automacao = '') => ({
  id,
  name,
  type: 'habilidade',
  system: { efeitos, automacao },
});

test('isButtonEffect: só os efeitos de ação viram botão', () => {
  assert.equal(isButtonEffect(one('passoCena')), true);
  assert.equal(isButtonEffect(one('acaoNota')), true);
  assert.equal(isButtonEffect(one('testeAcao')), true);
  assert.equal(isButtonEffect(one('defesaLivre')), true);
  assert.equal(isButtonEffect(one('ganharRecurso', { gatilho: 'acao' })), true);
  assert.equal(isButtonEffect(one('ganharRecurso', { gatilho: 'falha' })), false);
  for (const tipo of ['recurso', 'dadoExtra', 'rerrolar', 'companheiro', 'ajusteDados']) {
    assert.equal(isButtonEffect(one(tipo)), false, tipo);
  }
});

test('buttonLabel: rótulo próprio, texto antigo pelo id, ou automático com o custo', () => {
  assert.equal(buttonLabel(one('passoCena', { rotulo: 'Rugir' }), { t, skill }), 'Rugir');
  assert.equal(
    buttonLabel(
      legacyEffects('impeto').find((e) => e.id === 'impetoPasso'),
      { t, skill },
    ),
    'Subir atributo (3)',
  );
  assert.equal(
    buttonLabel(one('passoCena', { custo: { tipo: 'pd', valor: 2 } }), { t, skill }),
    'Passo na cena (2 PD)',
  );
  assert.equal(
    buttonLabel(one('testeAcao', { pericia: 'guerra', custo: { tipo: 'pd', valor: 3 } }), {
      t,
      skill,
    }),
    'Teste de Aptidões: Guerra (3 PD)',
  );
  assert.equal(
    buttonLabel(one('ganharRecurso', { recurso: 'furia', quantidade: 2, gatilho: 'acao' }), {
      t,
      skill,
    }),
    '+2 furia',
  );
  assert.equal(buttonLabel(one('acaoNota'), { t, skill }), 'Usar');
  assert.equal(buttonLabel(one('defesaLivre'), { t, skill }), 'Defesa livre');
});

test('buttonLabel: todo tipo com botão tem texto nos dois idiomas', () => {
  for (const dict of [pt, en]) {
    const tr = translator(dict);
    for (const tipo of ['passoCena', 'acaoNota', 'testeAcao', 'defesaLivre']) {
      assert.ok(buttonLabel(one(tipo, { custo: { tipo: 'pv', valor: 1 } }), { t: tr, skill }));
    }
    assert.ok(buttonLabel(one('ganharRecurso', { gatilho: 'acao' }), { t: tr, skill }));
  }
});

test('resourceName: nome próprio; sem ele, o padrão do ímpeto e da análise; senão o da habilidade', () => {
  assert.equal(
    resourceName({ chave: 'impeto', nome: 'Ímpeto X', itemName: 'Ímpeto X' }, t),
    'Ímpeto',
  );
  assert.equal(
    resourceName({ chave: 'analise', nome: 'Análise', itemName: 'Análise' }, t),
    'Marcadores',
  );
  assert.equal(resourceName({ chave: 'furia', nome: 'Fúria', itemName: 'Berserk' }, t), 'Fúria');
  assert.equal(
    resourceName({ chave: 'furia', nome: 'Berserk', itemName: 'Berserk' }, t),
    'Berserk',
  );
});

test('resourceBars: bolinhas até 10; acima disso, número; cor própria só no ímpeto e na análise', () => {
  const entries = collectEffects([
    ability('a', 'Ímpeto', [], 'impeto'),
    ability('b', 'Fé', [
      { id: 'r1', tipo: 'recurso', params: { chave: 'fe', maximo: 12 } },
      { id: 'r2', tipo: 'recurso', params: { chave: 'furia', nome: 'Fúria', maximo: 3 } },
    ]),
  ]);
  const bars = resourceBars(entries, { impeto: 2, fe: 20, furia: 1 }, t);
  assert.deepEqual(
    bars.map((b) => [b.chave, b.nome, b.value, b.max, b.tone, b.pips?.length ?? null]),
    [
      ['impeto', 'Ímpeto', 2, 5, 'impeto', 5],
      ['fe', 'Fé', 12, 12, 'outro', null],
      ['furia', 'Fúria', 1, 3, 'outro', 3],
    ],
  );
  assert.deepEqual(
    bars[0].pips.map((p) => p.filled),
    [true, true, false, false, false],
  );
  assert.equal(MAX_PIPS, 10);
});

test('abilityControls: contadores e botões na ordem dos efeitos', () => {
  const controls = abilityControls(
    ability('a', 'Plano', [
      { id: 'p1', tipo: 'testeAcao', params: { resultado: 'concederDados', pericia: 'guerra' } },
      { id: 'p2', tipo: 'acaoNota', params: { rotulo: 'Gritar' } },
    ]),
    {},
    { t, skill },
  );
  assert.deepEqual(controls.counters, []);
  assert.deepEqual(
    controls.buttons.map((b) => [b.effectId, b.tipo, b.label]),
    [
      ['p1', 'testeAcao', 'Teste de Aptidões: Guerra'],
      ['p2', 'acaoNota', 'Gritar'],
    ],
  );
  assert.equal(controls.showCompanion, false);
});

test('bonusDiceGranted: 1 dado, mais 1 a cada margem acima da DT; falha não dá nada', () => {
  assert.equal(bonusDiceGranted(7, 7, 3), 1);
  assert.equal(bonusDiceGranted(9, 7, 3), 1);
  assert.equal(bonusDiceGranted(10, 7, 3), 2);
  assert.equal(bonusDiceGranted(13, 7, 3), 3);
  assert.equal(bonusDiceGranted(6, 7, 3), 0);
  assert.equal(bonusDiceGranted(NaN, 7, 3), 0);
  assert.equal(bonusDiceGranted(9, 7, 0), 3);
});

test('groupBonusDice agrupa a reserva por tamanho e ignora valores estranhos', () => {
  assert.deepEqual(groupBonusDice([6, 8, 6, 5, 'x']), [
    { die: 6, count: 2 },
    { die: 8, count: 1 },
  ]);
  assert.deepEqual(groupBonusDice(undefined), []);
});

test('sceneReset esvazia a reserva de dados bônus', () => {
  const changes = sceneReset({ pv: 3, contusao: false, estupor: false, efeitos: [] });
  assert.deepEqual(changes['system.dadosBonus'], []);
});

test('interceptar vira botão «Assumir ataque» com o custo; ajuste de dados usa o nome do recurso', () => {
  assert.equal(isButtonEffect(one('interceptar')), true);
  assert.equal(
    buttonLabel(one('interceptar', { custo: { tipo: 'pd', valor: 2 } }), { t, skill }),
    'Assumir ataque (2 PD)',
  );
  assert.equal(
    adjustLabel(
      { chave: 'analise', points: 3, def: { chave: 'analise', nome: 'A', itemName: 'A' } },
      t,
    ),
    t('DESORDEM.Habilidade.AnaliseBotao', { pontos: 3 }),
  );
  assert.equal(
    adjustLabel(
      { chave: 'furia', points: 2, def: { chave: 'furia', nome: 'Fúria', itemName: 'X' } },
      t,
    ),
    'Ajustar dados: Fúria (2)',
  );
});

// ===== 0.20.7: criaturas e gatilhos =====

test('criatura: o editor só oferece «sem custo» e a ficha só mostra botões dos tipos permitidos', async () => {
  const { editorRows, CREATURE_EFFECT_TYPES } =
    await import('../scripts/rolls/ability-effects-editor.js');
  const { buildCreatureAbilityRows } = await import('../scripts/sheets/creature-context.js');
  assert.deepEqual(CREATURE_EFFECT_TYPES, ['dadoExtra', 'acaoNota', 'companheiro']);
  const list = [one('acaoNota', {}, 'n')];
  const [row] = editorRows(list, { t, skills: [], openId: 'n', creature: true });
  const cost = row.fields.find((f) => f.key === 'custo');
  assert.deepEqual(
    cost.kinds.map((k) => k.value),
    ['nenhum'],
  );
  const rows = buildCreatureAbilityRows(
    [
      ability('a', 'Grito', [{ id: 'g', tipo: 'acaoNota', params: { rotulo: 'Gritar' } }]),
      // Um passo na cena não é de criatura: sem botão
      ability('b', 'Fúria', [{ id: 'p', tipo: 'passoCena', params: {} }]),
    ],
    { t, skill },
  );
  const by = Object.fromEntries(rows.map((r) => [r.name, r]));
  assert.deepEqual(
    by.Grito.buttons.map((b) => [b.effectId, b.label]),
    [['g', 'Gritar']],
  );
  assert.deepEqual(by['Fúria'].buttons, []);
});

test('gatilhos «ao se defender» e «início do combate» enchem o recurso do efeito', () => {
  const entries = collectEffects([
    ability('a', 'Leitura', [
      { id: 'r', tipo: 'recurso', params: { chave: 'analise', maximo: 4 } },
      { id: 'd', tipo: 'ganharRecurso', params: { recurso: 'analise', gatilho: 'defender' } },
      {
        id: 'c',
        tipo: 'ganharRecurso',
        params: { recurso: 'analise', quantidade: 2, gatilho: 'inicioCombate' },
      },
    ]),
  ]);
  assert.deepEqual(triggerChanges(entries, { analise: 1 }, 'defender'), { analise: 2 });
  assert.deepEqual(triggerChanges(entries, { analise: 1 }, 'inicioCombate'), { analise: 3 });
  assert.deepEqual(triggerChanges(entries, { analise: 4 }, 'defender'), {});
});

// ===== 0.20.8: avisos e linha «Usou» =====

test('usedSummary: dados extras com custo, Defender-se, não letal e dados da reserva', async () => {
  const { usedSummary } = await import('../scripts/sheets/ability-controls.js');
  const { dialogDiceOptions } = await import('../scripts/rolls/ability-effects.js');
  const entries = collectEffects([
    ability('a', 'Sorrateiro', [], 'sorrateiro'),
    ability('b', 'Fúria', [
      {
        id: 'f',
        tipo: 'dadoExtra',
        params: { dado: 6, custo: { tipo: 'recurso', valor: 2, recurso: 'furia' } },
      },
    ]),
  ]);
  const diceOptions = dialogDiceOptions(entries, { skillKey: 'furtividade' });
  assert.deepEqual(
    usedSummary(['sorrateiro', 'f', 'defesa'], {
      diceOptions,
      reserveDice: [8, 6, 6],
      resourceNames: { furia: 'Fúria' },
      t,
    }),
    [
      'Sorrateiro (+d8 · 3 PD)',
      'Fúria (+d6 · 2 de Fúria)',
      t('DESORDEM.Teste.Pre.Hab.defesa', { die: 6 }),
      'Dados bônus (1d8 + 2d6)',
    ],
  );
  assert.deepEqual(usedSummary([], { diceOptions, t }), []);
});

test('conditionFlips: avisa quando a condição passa a valer e quando deixa de valer', async () => {
  const { conditionFlips } = await import('../scripts/rolls/ability-effects.js');
  const entries = collectEffects([
    ability('a', 'Instinto', [
      { id: 'i', tipo: 'passoCondicional', params: { condicao: 'pvMetade' } },
    ]),
  ]);
  const at = (pv) => ({ pv, pvMax: 15, pd: 10, pdMax: 10 });
  assert.deepEqual(
    conditionFlips(entries, at(9), at(7)).map((f) => [f.entry.id, f.active]),
    [['i', true]],
  );
  assert.deepEqual(
    conditionFlips(entries, at(7), at(8)).map((f) => [f.entry.id, f.active]),
    [['i', false]],
  );
  assert.deepEqual(conditionFlips(entries, at(7), at(3)), []);
  assert.deepEqual(conditionFlips(entries, at(12), at(9)), []);
});

test('resourceChanges lê os recursos de uma gravação', async () => {
  const { resourceChanges } = await import('../scripts/rolls/ability-effects-actor.js');
  assert.deepEqual(
    resourceChanges({
      'system.recursosHab.impeto': 3,
      'system.pd.value': 2,
      'system.recursosHab.fe': 0,
    }),
    { impeto: 3, fe: 0 },
  );
});
