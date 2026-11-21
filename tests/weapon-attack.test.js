/**
 * v0.21.1 — armas: munição da arma de arremesso, proficiência marcial, efeitos de ataque (bônus,
 * passo, crítico ampliado), seção «Itens» da janela pré-teste e linha «Usou» do cartão.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkEquipment,
  isMartial,
  weaponAmmoChanges,
  weaponReady,
} from '../scripts/rolls/equipment.js';
import {
  collectEffects,
  dialogDiceOptions,
  firstWeaponAttack,
  hasMartialProficiency,
  markWeaponAttack,
  itemEffectTypes,
  normalizeEffects,
  weaponAttackEffects,
} from '../scripts/rolls/ability-effects.js';
import {
  describeEffect,
  editorRows,
  effectSupported,
} from '../scripts/rolls/ability-effects-editor.js';
import { attackUsedLines } from '../scripts/sheets/ability-controls.js';
import { resolveTest } from '../scripts/rolls/test.js';
import { sequenceRng } from '../scripts/rolls/dice.js';
import { buildRollModel } from '../scripts/rolls/roll-dialog.js';
import { buildEquipmentRows } from '../scripts/sheets/context.js';
import { weaponChoices } from '../scripts/rolls/opposed-card.js';
import { sceneReset } from '../scripts/rolls/abilities.js';

const t = (key, data) => (data ? `${key}:${JSON.stringify(data)}` : key);
const skill = (key) => key;
const piece = (id, type, system, name = id) => ({ id, name, type, system });
const weapon = (efeitos, extra = {}) =>
  piece(
    'w',
    'arma',
    {
      tipo: 'corpo',
      categoria: 'simples',
      empunhadura: 'uma',
      bonusDano: 2,
      baseDano: 'ra',
      pericia: '',
      naoLetal: false,
      empunhada: false,
      quantidade: 1,
      consumivel: false,
      efeitos,
      ...extra,
    },
    'Lança',
  );

// ---------- Munição ----------

test('weaponReady: só a arma consumível sem unidades não ataca', () => {
  assert.equal(weaponReady({ consumivel: false, quantidade: 0 }), true);
  assert.equal(weaponReady({ consumivel: true, quantidade: 2 }), true);
  assert.equal(weaponReady({ consumivel: true, quantidade: 0 }), false);
  assert.equal(weaponReady({}), true);
});

test('weaponAmmoChanges gasta uma unidade e, em 0, não muda nada', () => {
  assert.deepEqual(weaponAmmoChanges({ consumivel: true, quantidade: 3 }), {
    'system.quantidade': 2,
  });
  assert.equal(weaponAmmoChanges({ consumivel: true, quantidade: 0 }), null);
  assert.equal(weaponAmmoChanges({ consumivel: false, quantidade: 3 }), null);
});

test('weaponChoices (teste oposto) deixa de fora a arma consumível sem unidades', () => {
  const items = [
    weapon([], { consumivel: true, quantidade: 0 }),
    piece('m', 'arma', { tipo: 'corpo', bonusDano: 0, consumivel: false }, 'Machado'),
  ];
  assert.deepEqual(
    weaponChoices(items, 'corpo').map((w) => w.id),
    ['m'],
  );
});

// ---------- Proficiência ----------

test('hasMartialProficiency: pela caixa da ficha ou por um efeito de habilidade', () => {
  assert.equal(hasMartialProficiency({ proficienciaMarcial: true }, []), true);
  assert.equal(hasMartialProficiency({}, []), false);
  const entries = collectEffects([
    piece('h', 'habilidade', { efeitos: [{ id: 'p', tipo: 'proficienciaMarcial', params: {} }] }),
  ]);
  assert.equal(hasMartialProficiency({}, entries), true);
});

test('proficienciaMarcial só existe na habilidade; os efeitos de ataque, só na arma', () => {
  assert.ok(itemEffectTypes('habilidade').includes('proficienciaMarcial'));
  assert.equal(itemEffectTypes('habilidade').includes('bonusAtaque'), false);
  assert.equal(itemEffectTypes('arma').includes('proficienciaMarcial'), false);
  assert.equal(effectSupported({ tipo: 'bonusAtaque', params: {} }, 'arma'), true);
  assert.equal(effectSupported({ tipo: 'bonusAtaque', params: {} }), false);
});

test('checkEquipment: sem proficiência não empunha arma marcial; com ela, sim', () => {
  const sword = {
    type: 'arma',
    system: { categoria: 'marcial', empunhadura: 'uma', empunhada: true },
  };
  assert.equal(isMartial(sword.system), true);
  assert.deepEqual(checkEquipment([], sword, { proficient: false }), {
    ok: false,
    reason: 'proficiencia',
  });
  assert.equal(checkEquipment([], sword, { proficient: true }).ok, true);
  // Padrão: quem chama sem informar (criaturas) não é travado
  assert.equal(checkEquipment([], sword).ok, true);
  // Guardar a arma (empunhada: false) sempre pode
  const stored = { ...sword, system: { ...sword.system, empunhada: false } };
  assert.equal(checkEquipment([], stored, { proficient: false }).ok, true);
});

test('buildEquipmentRows: marcial sem proficiência trava empunhar e mostra o aviso', () => {
  const labels = {
    kindLabel: (k) => k,
    handsLabel: (n) => String(n),
    skillLabel: (k) => k,
  };
  const martial = weapon([], { categoria: 'marcial' });
  const [locked] = buildEquipmentRows([martial], { ...labels, proficient: false }).weapons;
  assert.equal(locked.blocked, true);
  assert.equal(locked.blockReason, 'proficiencia');
  assert.equal(locked.lacksProficiency, true);
  // Já empunhada: pode ser guardada (caixa livre), e o aviso continua
  const held = weapon([], { categoria: 'marcial', empunhada: true });
  const [heldRow] = buildEquipmentRows([held], { ...labels, proficient: false }).weapons;
  assert.equal(heldRow.blocked, false);
  assert.equal(heldRow.lacksProficiency, true);
  const [ok] = buildEquipmentRows([martial], { ...labels, proficient: true }).weapons;
  assert.equal(ok.blocked, false);
  // Arma de arremesso sem unidades: Atacar desativado
  const empty = weapon([], { consumivel: true, quantidade: 0 });
  const [emptyRow] = buildEquipmentRows([empty], labels).weapons;
  assert.equal(emptyRow.canAttack, false);
  assert.equal(emptyRow.consumivel, true);
});

// ---------- Efeitos de ataque ----------

const attackEntries = (efeitos) =>
  collectEffects([weapon(normalizeEffects(efeitos))], { weaponId: 'w' });

test('weaponAttackEffects soma bônus, passos que valem e o menor mínimo do crítico', () => {
  const entries = attackEntries([
    { id: 'b', tipo: 'bonusAtaque', params: { valor: 1 } },
    { id: 's', tipo: 'passoAtaque', params: { passos: 1, quando: 'sempre' } },
    { id: 'f', tipo: 'passoAtaque', params: { passos: 2, quando: 'primeiroCena' } },
    { id: 'n', tipo: 'passoAtaque', params: { passos: 1, quando: 'naoAtacou' } },
    { id: 'c', tipo: 'criticoAmpliado', params: { minimo: 5 } },
  ]);
  const later = weaponAttackEffects(entries, { firstAttack: false, notAttacked: false });
  assert.equal(later.modifier, 1);
  assert.equal(later.steps, 1);
  assert.equal(later.critMin, 5);
  assert.deepEqual(
    later.lines.map((l) => [l.key, l.applies, l.optional]),
    [
      ['b', true, false],
      ['s', true, false],
      ['f', false, false],
      ['n', false, true],
      ['c', true, false],
    ],
  );
  const first = weaponAttackEffects(entries, { firstAttack: true, notAttacked: true });
  assert.equal(first.steps, 4);
});

test('weaponAttackEffects ignora efeitos que não são de arma e fica neutro sem eles', () => {
  const entries = collectEffects([
    piece('h', 'habilidade', { efeitos: [{ id: 'd', tipo: 'dadoExtra', params: {} }] }),
  ]);
  assert.deepEqual(weaponAttackEffects(entries), {
    modifier: 0,
    steps: 0,
    critMin: null,
    lines: [],
  });
});

test('efeitos de ataque fora do ataque com a arma não aparecem', () => {
  const items = [
    weapon(normalizeEffects([{ id: 'b', tipo: 'bonusAtaque', params: { valor: 2 } }])),
  ];
  assert.equal(weaponAttackEffects(collectEffects(items)).modifier, 0);
  assert.equal(weaponAttackEffects(collectEffects(items, { weaponId: 'outra' })).modifier, 0);
});

test('resolveTest: crítico ampliado com dois 5; o padrão continua 6', () => {
  // Atributo d6 e perícia d6, os dois tiram 5
  const roll = (critMin) =>
    resolveTest({ attrDie: 6, skillDie: 6, dt: 20, critMin, rng: sequenceRng([5, 5]) });
  assert.equal(roll(undefined).criticalSuccess, false);
  assert.equal(roll(5).criticalSuccess, true);
  assert.equal(roll(5).success, true);
  assert.ok(roll(5).dice.every((d) => d.critical));
  // Valores fora da faixa 2..6 voltam ao padrão
  assert.equal(roll(1).criticalSuccess, false);
  assert.equal(roll(9).criticalSuccess, false);
});

test('attackUsedLines: só o que entrou no ataque vai para a linha «Usou»', () => {
  const lines = [
    { kind: 'bonus', itemName: 'Gládio', value: 1, applies: true },
    { kind: 'passo', itemName: 'Lança', value: 1, applies: false },
    { kind: 'critico', itemName: 'Espada', value: 5, applies: true },
  ];
  assert.deepEqual(attackUsedLines(lines, t), [
    'DESORDEM.Teste.UsouArma.bonus:{"nome":"Gládio","valor":1}',
    'DESORDEM.Teste.UsouArma.critico:{"nome":"Espada","valor":5}',
  ]);
});

test('describeEffect: resumos dos efeitos novos', () => {
  const [bonus, step, crit] = normalizeEffects([
    { id: 'b', tipo: 'bonusAtaque', params: { valor: 3 } },
    { id: 's', tipo: 'passoAtaque', params: { passos: 2, quando: 'primeiroCena' } },
    { id: 'c', tipo: 'criticoAmpliado', params: { minimo: 4 } },
  ]);
  assert.ok(describeEffect(bonus, { t, skill }).includes('"valor":3'));
  assert.ok(describeEffect(step, { t, skill }).includes('"passos":2'));
  assert.ok(describeEffect(crit, { t, skill }).includes('"minimo":4'));
  assert.equal(
    describeEffect({ tipo: 'proficienciaMarcial', params: {} }, { t, skill }),
    'DESORDEM.Efeito.Resumo.proficienciaMarcial',
  );
});

// ---------- Janela pré-teste e cena ----------

test('buildRollModel: dados extras de itens vão para o grupo «item», mesmo com grupo Ação', () => {
  const entries = collectEffects(
    [
      piece('h', 'habilidade', {
        efeitos: [{ id: 'hab', tipo: 'dadoExtra', params: { dado: 4 } }],
      }),
      weapon(
        normalizeEffects([{ id: 'arma', tipo: 'dadoExtra', params: { dado: 6, grupo: 'acao' } }]),
      ),
    ],
    { weaponId: 'w' },
  );
  const options = dialogDiceOptions(entries, { skillKey: 'luta', testKind: 'ataqueCorpo' });
  assert.deepEqual(
    options.map((o) => [o.key, o.source]),
    [
      ['hab', 'habilidade'],
      ['arma', 'item'],
    ],
  );
  const model = buildRollModel({
    skillKey: 'luta',
    attrDie: 6,
    skillDie: 6,
    diceOptions: options,
    resources: { pd: 5, pv: 10, recursos: {}, dadosBonus: [] },
  });
  const group = (key) => model.abilities.find((a) => a.key === key).group;
  assert.equal(group('hab'), undefined);
  assert.equal(group('arma'), 'item');
});

test('sceneReset zera as armas que já atacaram na cena', () => {
  const reset = sceneReset({ pv: 5, contusao: false, estupor: false, efeitos: [] });
  assert.deepEqual(reset['system.cena.armasAtacaram'], []);
});

test('primeiro ataque da cena é por arma: outra arma ainda conta como primeira', () => {
  const cena = { armasAtacaram: [] };
  assert.equal(firstWeaponAttack(cena, 'lanca'), true);
  const after = markWeaponAttack(cena, 'lanca');
  assert.deepEqual(after, ['lanca']);
  assert.equal(firstWeaponAttack({ armasAtacaram: after }, 'lanca'), false);
  assert.equal(firstWeaponAttack({ armasAtacaram: after }, 'arco'), true);
  // Repetir a mesma arma não grava de novo; criatura (sem marcador) nunca é automática
  assert.equal(markWeaponAttack({ armasAtacaram: after }, 'lanca'), null);
  assert.equal(firstWeaponAttack(undefined, 'lanca'), false);
  assert.equal(markWeaponAttack(undefined, 'lanca'), null);
});

test('editor: nos equipamentos o dado extra não mostra «grupo na janela»', () => {
  const effects = normalizeEffects([{ id: 'x', tipo: 'dadoExtra', params: {} }]);
  const keys = (itemType) =>
    editorRows(effects, { t, skills: [], openId: 'x', itemType })[0].fields.map((f) => f.key);
  for (const itemType of ['arma', 'item', 'armadura']) {
    assert.equal(keys(itemType).includes('grupo'), false, itemType);
  }
  assert.equal(keys('habilidade').includes('grupo'), true);
});
