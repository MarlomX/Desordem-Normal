import test from 'node:test';
import assert from 'node:assert/strict';
import {
  tableEffect,
  tableEffectEntries,
  tableEntryOf,
  ownedTableKeys,
  hasContusion,
  effectText,
  legacyTableEffects,
  legacyMaxLoss,
  storesEffect,
  CONTUSION_KEY,
  presetOf,
  clearPresetText,
  COMBAT_CONDITIONS,
  DISASTER_EFFECTS,
} from '../scripts/rolls/condition-tables.js';
import { LESIONS, lookupLesion, pickLesion } from '../scripts/rolls/injury.js';
import { TRAUMAS, lookupTrauma, pickTrauma } from '../scripts/rolls/emotional.js';
import {
  conditionModifier,
  emotionalExtra,
  maxReduction,
  effectiveMax,
  baseForMax,
} from '../scripts/rolls/effects.js';
import { collectStepMods } from '../scripts/rolls/steps.js';
import { migrateConditionTables, migrateThreatBase } from '../scripts/data/migrations.js';
import { describeEffect } from '../scripts/rolls/ability-effects-editor.js';
import { normalizeEffect } from '../scripts/rolls/ability-effects.js';

const lesion = (key) =>
  tableEffect(
    'lesao',
    LESIONS.find((e) => e.key === key),
    key,
  );
const trauma = (key) =>
  tableEffect(
    'trauma',
    TRAUMAS.find((e) => e.key === key),
    key,
  );

// ---------- Efeitos das tabelas ----------

test('storesEffect: lesões permanentes, contusão e traumas persistentes ficam na ficha', () => {
  assert.equal(storesEffect(lookupLesion(11)), true);
  assert.equal(storesEffect(lookupLesion(19)), true);
  assert.equal(storesEffect(lookupLesion(1)), false);
  assert.equal(storesEffect(lookupLesion(20)), false);
  assert.equal(storesEffect(lookupTrauma(5)), true);
  assert.equal(storesEffect(lookupTrauma(16)), false);
  assert.equal(storesEffect(lookupTrauma(18)), false);
});

test('tableEffect: chave da tabela, texto vazio (traduzido pela chave), duração e mecânica', () => {
  const effect = lesion('cicatrizAssustadora');
  assert.equal(effect.chave, 'lesao:cicatrizAssustadora');
  assert.deepEqual([effect.nome, effect.descricao, effect.origem], ['', '', 'lesao']);
  assert.equal(effect.duracao, 'permanente');
  assert.deepEqual(
    effect.efeitos.map((e) => [e.id, e.tipo, e.params.pericia, e.params.mod]),
    [
      ['m0', 'modificador', 'persuasao', -2],
      ['m1', 'modificador', 'intimidar', 1],
    ],
  );
  const contusion = lesion('contusao');
  assert.equal(contusion.duracao, 'cena');
  assert.deepEqual(contusion.efeitos[0].params, {
    alvo: 'atributo',
    atributo: 'fisico',
    pericia: '',
    passos: -1,
    teste: 'qualquer',
  });
});

test('tableEffectEntries: atributos, dano emocional a mais e redução do máximo', () => {
  const types = (entry) => tableEffectEntries(entry).map((e) => [e.tipo, e.params]);
  assert.deepEqual(types(TRAUMAS.find((e) => e.key === 'degradacaoCognitiva')), [
    ['modificador', { sobre: 'atributo', atributo: 'mente', pericia: '', mod: -1 }],
  ]);
  assert.deepEqual(types(TRAUMAS.find((e) => e.key === 'estressePosTraumatico')), [
    ['danoEmocionalExtra', { extra: 1 }],
  ]);
  assert.deepEqual(types(LESIONS.find((e) => e.key === 'lacearacaoProfunda')), [
    ['reducaoMaximo', { recursoMax: 'pv', reducao: 2 }],
  ]);
  assert.deepEqual(types(TRAUMAS.find((e) => e.key === 'chagaAlma')), [
    ['reducaoMaximo', { recursoMax: 'pd', reducao: 2 }],
  ]);
  // Sem Mão: só descrição
  assert.deepEqual(types(LESIONS.find((e) => e.key === 'semMao')), []);
});

test('tableEntryOf e ownedTableKeys: as chaves das tabelas, repetidas; o resto é ignorado', () => {
  assert.equal(tableEntryOf('lesao:semOlho').entry.key, 'semOlho');
  assert.equal(tableEntryOf('trauma:semOlho'), null);
  assert.equal(tableEntryOf('Compendium.x.Item.y'), null);
  const effects = [
    lesion('lacearacaoProfunda'),
    lesion('lacearacaoProfunda'),
    trauma('panico'),
    { id: 'm', nome: 'Caído', chave: '', efeitos: [] },
  ];
  assert.deepEqual(ownedTableKeys(effects, 'lesao'), ['lacearacaoProfunda', 'lacearacaoProfunda']);
  assert.deepEqual(ownedTableKeys(effects, 'trauma'), ['panico']);
  // «já tem, role de novo» continua igual, agora pelas chaves dos efeitos
  const owned = ownedTableKeys([lesion('semOlho')], 'lesao');
  assert.equal(pickLesion(11, owned).reroll, true);
  assert.equal(pickLesion(10, ownedTableKeys(effects, 'lesao')).reroll, false);
  assert.equal(
    pickTrauma(8, ownedTableKeys([trauma('degradacaoCognitiva')], 'trauma')).reroll,
    true,
  );
});

test('hasContusion e o passo da contusão nos testes de Físico', () => {
  const effects = [lesion('contusao')];
  assert.equal(hasContusion(effects), true);
  assert.equal(hasContusion([lesion('semOlho')]), false);
  assert.equal(CONTUSION_KEY, 'lesao:contusao');
  assert.deepEqual(collectStepMods({ steps: {}, effects, attrKey: 'fisico' }), [
    { target: 'attribute', steps: -1 },
  ]);
  assert.deepEqual(collectStepMods({ steps: {}, effects, attrKey: 'mente' }), []);
});

test('effectText: texto traduzido pela chave enquanto o efeito não tiver um escrito', () => {
  const t = (key) => `«${key}»`;
  assert.deepEqual(effectText(lesion('semOlho'), t), {
    nome: '«DESORDEM.Lesoes.semOlho.Nome»',
    descricao: '«DESORDEM.Lesoes.semOlho.Descricao»',
    kind: 'lesao',
  });
  const edited = { ...trauma('panico'), nome: 'Medo de água' };
  assert.equal(effectText(edited, t).nome, 'Medo de água');
  assert.equal(effectText(edited, t).descricao, '«DESORDEM.Traumas.panico.Descricao»');
  assert.equal(effectText(edited, t).kind, 'trauma');
  assert.deepEqual(effectText({ nome: 'Caído', descricao: 'd', chave: '' }, t), {
    nome: 'Caído',
    descricao: 'd',
    kind: '',
  });
});

// ---------- Leitura nos testes e no dano ----------

test('conditionModifier soma os modificadores das lesões e traumas (o mesmo de antes)', () => {
  const mod = (keys, test) =>
    conditionModifier(
      keys.map((k) => (TRAUMAS.some((e) => e.key === k) ? trauma(k) : lesion(k))),
      test,
    );
  assert.equal(mod(['semOlho'], { skillKey: 'percepcao' }), -1);
  assert.equal(mod(['semOlho', 'orgaoSensorialComprometido'], { skillKey: 'percepcao' }), -3);
  assert.equal(mod(['cicatrizAssustadora'], { skillKey: 'persuasao' }), -2);
  assert.equal(mod(['cicatrizAssustadora'], { skillKey: 'intimidar' }), 1);
  assert.equal(mod(['semOlho'], { skillKey: 'luta' }), 0);
  assert.equal(mod(['degradacaoCognitiva'], { attrKey: 'mente' }), -1);
  assert.equal(mod(['degradacaoCognitiva'], { attrKey: 'fisico' }), 0);
  assert.equal(
    mod(['maculaPsiquica', 'retracaoDefensiva'], { attrKey: 'emocao', skillKey: 'intuicao' }),
    -3,
  );
  // Modificador «qualquer atributo» vale em todo teste
  const any = [
    {
      id: 'x',
      efeitos: [
        { id: 'a', tipo: 'modificador', params: { sobre: 'atributo', atributo: 'todos', mod: 2 } },
      ],
    },
  ];
  assert.equal(conditionModifier(any, { attrKey: 'fisico' }), 2);
  assert.equal(conditionModifier(undefined, { attrKey: 'mente' }), 0);
});

test('emotionalExtra, maxReduction, effectiveMax e baseForMax', () => {
  const effects = [
    trauma('estressePosTraumatico'),
    lesion('lacearacaoProfunda'),
    lesion('lacearacaoProfunda'),
    trauma('chagaAlma'),
  ];
  assert.equal(emotionalExtra(effects), 1);
  assert.equal(emotionalExtra([]), 0);
  assert.equal(maxReduction(effects, 'pv'), 4);
  assert.equal(maxReduction(effects, 'pd'), 2);
  assert.equal(effectiveMax(15, effects, 'pv'), 11);
  assert.equal(effectiveMax(3, effects, 'pv'), 0);
  assert.equal(effectiveMax('abc', [], 'pv'), 0);
  // Remover uma laceração devolve os 2 PV de máximo
  assert.equal(effectiveMax(15, effects.slice(0, 2), 'pv'), 13);
  assert.equal(baseForMax(11, effects, 'pv'), 15);
  assert.equal(baseForMax(-2, [], 'pd'), 0);
});

test('resumos dos tipos novos: valores com sinal e os textos de cada parte', () => {
  // Tradução de teste: a chave seguida dos dados, para ver o que cada parte recebe
  const t = (key, data) => (data ? `${key}${JSON.stringify(data)}` : key);
  const skill = (k) => k.toUpperCase();
  const show = (tipo, params) =>
    describeEffect(normalizeEffect({ id: 'a', tipo, params }), { t, skill, itemType: 'efeito' });
  const mod = show('modificador', { sobre: 'pericia', pericia: 'acrobacia', mod: -2 });
  assert.match(mod, /^DESORDEM\.Efeito\.Resumo\.modificador/);
  assert.match(mod, /"mod":"-2"/);
  assert.match(mod, /ACROBACIA/);
  assert.match(
    show('modificador', { sobre: 'atributo', atributo: 'mente', mod: 1 }),
    /"mod":"\+1"/,
  );
  assert.match(show('danoEmocionalExtra', { extra: 2 }), /"extra":2/);
  assert.match(show('reducaoMaximo', { recursoMax: 'pd', reducao: 2 }), /RecursosMax\.pd/);
});

// ---------- Migração (até a v0.22.1) ----------

test('legacyTableEffects: ids fixos e sem repetir o que já foi convertido', () => {
  const old = { lesoes: ['semOlho', 'lacearacaoProfunda'], traumas: ['chagaAlma'], contusao: true };
  const added = legacyTableEffects(old, new Set());
  assert.deepEqual(
    added.map((e) => [e.id, e.chave]),
    [
      ['les0', 'lesao:semOlho'],
      ['les1', 'lesao:lacearacaoProfunda'],
      ['tra0', 'trauma:chagaAlma'],
      ['contusao0', 'lesao:contusao'],
    ],
  );
  assert.deepEqual(legacyTableEffects(old, new Set(['les0', 'les1', 'tra0', 'contusao0'])), []);
  // Chave desconhecida (ou de uma entrada que não fica) é ignorada
  assert.deepEqual(legacyTableEffects({ lesoes: ['nada', 'morteSubita'] }, new Set()), []);
});

test('legacyMaxLoss: o que as lesões e traumas antigos tiraram do máximo', () => {
  assert.deepEqual(
    legacyMaxLoss({
      lesoes: ['lacearacaoProfunda', 'lacearacaoProfunda', 'semOlho'],
      traumas: ['chagaAlma'],
    }),
    { pv: 4, pd: 2 },
  );
  assert.deepEqual(legacyMaxLoss({}), { pv: 0, pd: 0 });
});

test('migrateConditionTables: efeitos, base e campos antigos removidos; repetir não muda nada', () => {
  const source = {
    pv: { value: 5, max: 6 },
    pd: { value: 3, max: 8 },
    estado: { inconsciente: false, contusao: true },
    lesoes: ['lacearacaoProfunda', 'lacearacaoProfunda'],
    traumas: ['chagaAlma'],
    efeitos: [{ id: 'a', nome: 'Tônico', duracao: 'cena', efeitos: [] }],
  };
  migrateConditionTables(source);
  assert.equal(source.pv.base, 10);
  assert.equal(source.pd.base, 10);
  assert.equal('lesoes' in source, false);
  assert.equal('traumas' in source, false);
  assert.equal('contusao' in source.estado, false);
  assert.deepEqual(
    source.efeitos.map((e) => e.id),
    ['a', 'les0', 'les1', 'tra0', 'contusao0'],
  );
  // O máximo calculado sai igual ao antigo
  assert.equal(effectiveMax(source.pv.base, source.efeitos, 'pv'), 6);
  assert.equal(effectiveMax(source.pd.base, source.efeitos, 'pd'), 8);
  const again = structuredClone(source);
  migrateConditionTables(again);
  assert.deepEqual(again, source);
});

test('migrateConditionTables: dados antigos de novo (banco ainda sem gravar) não duplicam', () => {
  const converted = { efeitos: legacyTableEffects({ lesoes: ['semOlho'] }, new Set()) };
  const stale = {
    lesoes: ['semOlho'],
    pv: { value: 1, max: 10, base: 10 },
    efeitos: converted.efeitos,
  };
  migrateConditionTables(stale);
  assert.deepEqual(
    stale.efeitos.map((e) => e.id),
    ['les0'],
  );
  assert.equal(stale.pv.base, 10); // base já existente não muda
});

test('migrateConditionTables não mexe nas mudanças de uma gravação (sem as listas antigas)', () => {
  const diff = { pv: { max: 12 } };
  migrateConditionTables(diff);
  assert.deepEqual(diff, { pv: { max: 12 } });
});

test('migrateThreatBase: a base nasce igual ao máximo; com base, nada muda', () => {
  assert.deepEqual(migrateThreatBase({ pv: { value: 3, max: 20 } }), {
    pv: { value: 3, max: 20, base: 20 },
  });
  assert.deepEqual(migrateThreatBase({ pv: { value: 3, max: 20, base: 25 } }).pv.base, 25);
  assert.deepEqual(migrateThreatBase({ pv: { value: 3 } }), { pv: { value: 3 } });
  assert.deepEqual(migrateThreatBase({}), {});
});

// ---------- Efeitos prontos do compêndio (v0.22.3) ----------

test('presetOf: lesões, traumas, condições e falha crítica; o resto não', () => {
  assert.equal(presetOf('cond:caido').base, 'DESORDEM.Condicoes');
  assert.equal(presetOf('falha:machucado').entry.attr, 'fisico');
  assert.equal(presetOf('lesao:semOlho').kind, 'lesao');
  assert.equal(presetOf('falha:vexame'), null); // não fica na ficha
  assert.equal(presetOf('cond:nada'), null);
  assert.equal(presetOf('Compendium.x.Item.y'), null);
  // As condições não são «lesões» para o «já tem, role de novo»
  assert.equal(tableEntryOf('cond:caido'), null);
});

test('efeitos prontos: mecânica e duração das condições e da falha crítica', () => {
  const caido = tableEffect(
    'cond',
    COMBAT_CONDITIONS.find((e) => e.key === 'caido'),
  );
  assert.equal(caido.duracao, 'manual');
  assert.equal(caido.origem, '');
  assert.deepEqual(caido.efeitos[0].params, {
    alvo: 'atributo',
    atributo: 'fisico',
    pericia: '',
    passos: -1,
    teste: 'qualquer',
  });
  const agarrado = tableEffect(
    'cond',
    COMBAT_CONDITIONS.find((e) => e.key === 'agarrado'),
  );
  assert.deepEqual(
    [agarrado.efeitos[0].params.alvo, agarrado.efeitos[0].params.teste],
    ['pericias', 'ataque'],
  );
  assert.deepEqual(
    tableEffect(
      'cond',
      COMBAT_CONDITIONS.find((e) => e.key === 'atordoado'),
    ).efeitos,
    [],
  );
  const irritacao = tableEffect(
    'falha',
    DISASTER_EFFECTS.find((e) => e.key === 'irritacao'),
  );
  assert.equal(irritacao.duracao, 'cena');
  assert.equal(irritacao.efeitos[0].params.atributo, 'emocao');
  assert.deepEqual(
    DISASTER_EFFECTS.map((e) => e.key),
    ['machucado', 'desatencao', 'irritacao'],
  );
});

test('clearPresetText e effectText: a cópia de um efeito pronto mostra o texto traduzido', () => {
  const t = (key) => `«${key}»`;
  const copy = clearPresetText({ id: 'a', nome: 'Caído', descricao: 'pt', chave: 'cond:caido' });
  assert.deepEqual([copy.nome, copy.descricao], ['', '']);
  assert.deepEqual(effectText(copy, t), {
    nome: '«DESORDEM.Condicoes.caido.Nome»',
    descricao: '«DESORDEM.Condicoes.caido.Descricao»',
    kind: '', // condição: etiqueta «Efeito»
  });
  const own = { id: 'b', nome: 'Bênção', descricao: 'x', chave: 'Compendium.x.Item.y' };
  assert.equal(clearPresetText(own), own);
  assert.equal(
    effectText(clearPresetText({ chave: 'falha:desatencao' }), t).nome,
    '«DESORDEM.FalhaCritica.desatencao.Nome»',
  );
});
