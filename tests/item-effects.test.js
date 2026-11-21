/**
 * v0.21.0 — base comum dos equipamentos: migração (natural/maos → categoria/empunhadura), mãos
 * pela empunhadura, efeitos nos equipamentos (só com o item em uso) e o editor por tipo de item.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateGearSource, migrateWeaponSource } from '../scripts/data/migrations.js';
import { checkEquipment, handsInUse, handsOf, isNatural } from '../scripts/rolls/equipment.js';
import {
  EFFECT_TYPES,
  EQUIPMENT_ONLY_TYPES,
  collectEffects,
  dialogDiceOptions,
  itemEffectTypes,
  itemInUse,
  normalizeEffects,
  ownEffects,
} from '../scripts/rolls/ability-effects.js';
import {
  CREATURE_EFFECT_TYPES,
  allowedEffectTypes,
  describeEffect,
  editorEffects,
  editorRows,
  effectSupported,
  itemEffectsText,
} from '../scripts/rolls/ability-effects-editor.js';
import { buildEquipmentRows } from '../scripts/sheets/context.js';

// Tradução de teste: a chave e, se houver, os dados (para conferir o que foi pedido)
const t = (key, data) => (data ? `${key}:${JSON.stringify(data)}` : key);
const skill = (key) => `p:${key}`;
const skills = [
  { key: 'crime', label: 'Crime' },
  { key: 'luta', label: 'Luta' },
];

const extraDie = (id, params = {}) => ({ id, tipo: 'dadoExtra', params: { dado: 8, ...params } });
const piece = (id, type, system, name = id) => ({ id, name, type, system });

// ---------- Migração ----------

test('migrateWeaponSource: natural vira categoria natural; o resto, simples', () => {
  assert.equal(migrateWeaponSource({ natural: true, maos: 1 }).categoria, 'natural');
  assert.equal(migrateWeaponSource({ natural: false, maos: 1 }).categoria, 'simples');
});

test('migrateWeaponSource: maos 2 vira duas mãos; maos 1, uma', () => {
  assert.equal(migrateWeaponSource({ natural: false, maos: 2 }).empunhadura, 'duas');
  assert.equal(migrateWeaponSource({ natural: false, maos: 1 }).empunhadura, 'uma');
  assert.equal(migrateWeaponSource({ natural: false, maos: '2' }).empunhadura, 'duas');
});

test('migrateWeaponSource não mexe em campos novos já gravados (caso misto)', () => {
  // Item antigo que depois foi trocado para simples: o `natural` velho continua no banco
  const source = { natural: true, maos: 1, categoria: 'simples', empunhadura: 'duas' };
  migrateWeaponSource(source);
  assert.equal(source.categoria, 'simples');
  assert.equal(source.empunhadura, 'duas');
});

test('migrateWeaponSource ignora gravações parciais sem os campos antigos', () => {
  // O Foundry pode passar só as mudanças de uma gravação: nada pode ser preenchido aqui
  const changes = { empunhada: true };
  migrateWeaponSource(changes);
  assert.deepEqual(changes, { empunhada: true });
});

test('migrateWeaponSource é idempotente e aceita dados vazios', () => {
  const source = { natural: true, maos: 2 };
  migrateWeaponSource(source);
  const once = structuredClone(source);
  migrateWeaponSource(source);
  assert.deepEqual(source, once);
  assert.equal(migrateWeaponSource(null), null);
  assert.deepEqual(migrateWeaponSource({}), {});
});

test('migrateGearSource: maos vira empunhadura e não cria categoria', () => {
  const source = migrateGearSource({ maos: 2, quantidade: 1 });
  assert.equal(source.empunhadura, 'duas');
  assert.equal('categoria' in source, false);
  assert.equal(migrateGearSource({ maos: 1, empunhadura: 'duas' }).empunhadura, 'duas');
  assert.deepEqual(migrateGearSource({ usos: 1 }), { usos: 1 });
});

// ---------- Mãos ----------

test('handsOf: natural 0, duas mãos 2, o resto 1', () => {
  assert.equal(handsOf({ categoria: 'natural', empunhadura: 'duas' }), 0);
  assert.equal(handsOf({ categoria: 'marcial', empunhadura: 'duas' }), 2);
  assert.equal(handsOf({ categoria: 'simples', empunhadura: 'uma' }), 1);
  assert.equal(handsOf({ empunhadura: 'duas' }), 2); // item geral (sem categoria)
  assert.equal(handsOf({}), 1);
  assert.equal(isNatural({ categoria: 'natural' }), true);
  assert.equal(isNatural({ categoria: 'simples' }), false);
});

test('handsInUse e checkEquipment usam a empunhadura (natural nunca ocupa mão)', () => {
  const bow = piece('b', 'arma', { categoria: 'simples', empunhadura: 'duas', empunhada: true });
  const claws = {
    type: 'arma',
    system: { categoria: 'natural', empunhadura: 'duas', empunhada: true },
  };
  const knife = {
    type: 'arma',
    system: { categoria: 'simples', empunhadura: 'uma', empunhada: true },
  };
  assert.deepEqual(handsInUse([bow.system, claws.system]), { used: 2, over: false });
  assert.equal(checkEquipment([bow], claws).ok, true);
  assert.deepEqual(checkEquipment([bow], knife), { ok: false, reason: 'maos' });
});

// ---------- Tipos aceitos e item em uso ----------

test('itemEffectTypes: habilidade aceita todos menos os de equipamento; cada equipamento, os seus', () => {
  assert.deepEqual(
    itemEffectTypes('habilidade'),
    Object.keys(EFFECT_TYPES).filter((tipo) => !EQUIPMENT_ONLY_TYPES.includes(tipo)),
  );
  assert.deepEqual(itemEffectTypes('arma'), [
    'dadoExtra',
    'bonusAtaque',
    'passoAtaque',
    'criticoAmpliado',
  ]);
  assert.deepEqual(itemEffectTypes('item'), ['dadoExtra']);
  assert.deepEqual(itemEffectTypes('armadura'), ['dadoExtra']);
  assert.deepEqual(itemEffectTypes('escudo'), ['dadoExtra', 'reducaoEscudo']);
  assert.deepEqual(itemEffectTypes('outro'), []);
});

test('allowedEffectTypes: num item de criatura, só os tipos de criatura entre os aceitos', () => {
  assert.deepEqual(allowedEffectTypes('habilidade', { creature: true }), [
    ...Object.keys(EFFECT_TYPES).filter((tipo) => CREATURE_EFFECT_TYPES.includes(tipo)),
  ]);
  assert.deepEqual(allowedEffectTypes('arma', { creature: true }), ['dadoExtra']);
  assert.deepEqual(allowedEffectTypes('armadura'), ['dadoExtra']);
});

test('itemInUse: arma só no ataque com ela, armadura só vestida, item e habilidade sempre', () => {
  const sword = piece('s', 'arma', {});
  assert.equal(itemInUse(sword), false);
  assert.equal(itemInUse(sword, { weaponId: 'outra' }), false);
  assert.equal(itemInUse(sword, { weaponId: 's' }), true);
  assert.equal(itemInUse(piece('a', 'armadura', { vestida: true })), true);
  assert.equal(itemInUse(piece('a', 'armadura', { vestida: false })), false);
  assert.equal(itemInUse(piece('i', 'item', {})), true);
  assert.equal(itemInUse(piece('h', 'habilidade', {})), true);
  assert.equal(itemInUse(null), false);
});

test('ownEffects descarta tipos que o equipamento não aceita (vindos de macro ou importação)', () => {
  const item = piece('i', 'item', {
    efeitos: [extraDie('x'), { id: 'y', tipo: 'acaoNota', params: {} }],
  });
  assert.deepEqual(
    ownEffects(item).map((e) => e.id),
    ['x'],
  );
  // Na armadura, a redução do escudo não vale (só no escudo)
  const shieldOnly = { id: 'z', tipo: 'reducaoEscudo', params: {} };
  assert.deepEqual(ownEffects(piece('a', 'armadura', { efeitos: [shieldOnly] })), []);
  assert.deepEqual(
    ownEffects(piece('e', 'armadura', { subtipo: 'escudo', efeitos: [shieldOnly] })).map(
      (e) => e.id,
    ),
    ['z'],
  );
});

test('collectEffects junta habilidades e equipamentos em uso, com itemType', () => {
  const items = [
    piece('h', 'habilidade', { efeitos: [extraDie('hab')] }, 'Hab'),
    piece('w', 'arma', { efeitos: [extraDie('arma', { dado: 6 })] }, 'Gládio'),
    piece('i', 'item', { efeitos: [extraDie('item', { dado: 4 })] }, 'Gazua'),
    piece('a', 'armadura', { vestida: true, efeitos: [extraDie('armadura')] }, 'Cota'),
    // Escudo guardado (não empunhado): os efeitos não valem
    piece('e', 'armadura', { subtipo: 'escudo', empunhada: false, efeitos: [extraDie('esc')] }),
  ];
  const outside = collectEffects(items);
  assert.deepEqual(
    outside.map((e) => [e.id, e.itemType]),
    [
      ['hab', 'habilidade'],
      ['item', 'item'],
      ['armadura', 'armadura'],
    ],
  );
  const attack = collectEffects(items, { weaponId: 'w' });
  const weaponEntry = attack.find((e) => e.id === 'arma');
  assert.equal(weaponEntry.itemName, 'Gládio');
  assert.equal(weaponEntry.itemType, 'arma');
});

test('dialogDiceOptions: dado da arma vale no ataque sem os filtros de perícia e de teste', () => {
  const entries = collectEffects(
    [
      piece('w', 'arma', {
        efeitos: [extraDie('arma', { dado: 6, pericias: ['crime'], teste: 'defesa' })],
      }),
      piece('i', 'item', { efeitos: [extraDie('gazua', { dado: 4, pericias: ['crime'] })] }),
    ],
    { weaponId: 'w' },
  );
  const options = dialogDiceOptions(entries, { skillKey: 'luta', testKind: 'ataqueCorpo' });
  // A gazua (item, só Crime) fica de fora; a arma entra mesmo com filtros gravados
  assert.deepEqual(
    options.map((o) => [o.key, o.die]),
    [['arma', 6]],
  );
});

// ---------- Editor ----------

test('editorEffects: equipamento sem efeitos não tem automação antiga', () => {
  assert.deepEqual(editorEffects({ efeitos: [], automacao: 'prontidao' }, 'arma'), {
    effects: [],
    legacy: false,
  });
  assert.equal(editorEffects({ efeitos: [], automacao: 'prontidao' }).legacy, true);
});

test('editorRows: na arma o dado extra esconde perícias e tipo de teste', () => {
  const effects = normalizeEffects([extraDie('x')]);
  const [weaponRow] = editorRows(effects, { t, skills, openId: 'x', itemType: 'arma' });
  const weaponKeys = weaponRow.fields.map((f) => f.key);
  assert.equal(weaponKeys.includes('pericias'), false);
  assert.equal(weaponKeys.includes('teste'), false);
  assert.equal(weaponKeys.includes('dado'), true);
  const [abilityRow] = editorRows(effects, { t, skills, openId: 'x' });
  assert.equal(
    abilityRow.fields.some((f) => f.key === 'pericias'),
    true,
  );
});

test('effectSupported: tipo que o item não aceita fica marcado como sem uso', () => {
  const note = { id: 'n', tipo: 'acaoNota', params: {} };
  assert.equal(effectSupported(note), true);
  assert.equal(effectSupported(note, 'item'), false);
  assert.equal(effectSupported(extraDie('d'), 'item'), true);
  assert.equal(effectSupported(extraDie('d'), 'armadura'), true);
  assert.equal(effectSupported(extraDie('d'), 'outro'), false);
});

test('describeEffect: na arma o dado extra é «no ataque com esta arma»', () => {
  const [effect] = editorRows(normalizeEffects([extraDie('x', { dado: 10 })]), {
    t,
    skills,
    openId: null,
  });
  assert.ok(effect.summary.startsWith('DESORDEM.Efeito.Resumo.dadoExtra:'));
  const text = describeEffect(
    { tipo: 'dadoExtra', params: { dado: 10, custo: { tipo: 'nenhum', valor: 0 } } },
    { t, skill, itemType: 'arma' },
  );
  assert.ok(text.startsWith('DESORDEM.Efeito.Resumo.dadoExtraArma:'));
  assert.ok(text.includes('"dado":10'));
});

test('itemEffectsText: um resumo por linha, só dos tipos aceitos; vazio sem efeitos', () => {
  const item = piece('w', 'arma', {
    efeitos: [
      extraDie('a', { dado: 4 }),
      extraDie('b', { dado: 6 }),
      { id: 'c', tipo: 'acaoNota' },
    ],
  });
  const lines = itemEffectsText(item, { t, skill }).split('\n');
  assert.equal(lines.length, 2);
  assert.ok(lines.every((line) => line.startsWith('DESORDEM.Efeito.Resumo.dadoExtraArma')));
  assert.equal(itemEffectsText(piece('x', 'item', { efeitos: [] }), { t, skill }), '');
});

// ---------- Ficha ----------

test('buildEquipmentRows: categoria da arma e efeitos numa linha à parte', () => {
  const weapon = piece('w', 'arma', {
    descricao: 'Lâmina curta',
    tipo: 'corpo',
    categoria: 'marcial',
    empunhadura: 'uma',
    bonusDano: 4,
    baseDano: 'ra',
    pericia: '',
    naoLetal: false,
    empunhada: false,
  });
  const rows = buildEquipmentRows([weapon], {
    kindLabel: (k) => k,
    handsLabel: (n) => `${n}m`,
    skillLabel: (k) => k,
    categoryLabel: (c) => `cat:${c}`,
    effectsText: () => '+d6 no ataque',
  });
  const [row] = rows.weapons;
  assert.equal(row.categoryLabel, 'cat:marcial');
  assert.equal(row.handsLabel, '1m');
  assert.equal(row.natural, false);
  assert.equal(row.descricao, 'Lâmina curta');
  assert.deepEqual(row.effects, ['+d6 no ataque']);
});
