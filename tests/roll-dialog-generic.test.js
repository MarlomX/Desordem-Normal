import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addCostBags,
  collectEffects,
  conditionalStepMods,
  costBag,
  costShortfall,
  dialogDiceOptions,
  emptyCostBag,
  pickBonusDice,
  spendBonusDice,
  weaponTestKind,
} from '../scripts/rolls/ability-effects.js';
import { activeBoosts } from '../scripts/rolls/abilities.js';
import {
  buildRollModel,
  emptySelection,
  evaluateSelection,
  selectionToOptions,
} from '../scripts/rolls/roll-dialog.js';

const ability = (id, name, efeitos) => ({
  id,
  name,
  type: 'habilidade',
  system: { efeitos, automacao: '' },
});
const extra = (id, params) => ({ id, tipo: 'dadoExtra', params });
const entries = collectEffects([
  ability('a', 'Fúria', [
    extra('furia', { dado: 8, custo: { tipo: 'recurso', valor: 2, recurso: 'furia' } }),
    extra('sangue', { dado: 10, custo: { tipo: 'pv', valor: 3 } }),
    extra('lamina', { dado: 6, teste: 'ataqueCorpo' }),
    extra('flecha', { dado: 6, teste: 'ataqueDistancia' }),
  ]),
]);
const model = (resources, extraInput = {}) =>
  buildRollModel({
    skillKey: 'luta',
    attrDie: 8,
    skillDie: 6,
    diceOptions: dialogDiceOptions(entries, { skillKey: 'luta' }),
    resources,
    ignoreFear: true,
    ...extraInput,
  });

// ---------- Custos ----------

test('costBag, addCostBags e costShortfall: PD, PV e recursos pela chave', () => {
  assert.deepEqual(costBag({ tipo: 'pv', valor: 2 }), { pd: 0, pv: 2, recursos: {} });
  assert.deepEqual(costBag({ tipo: 'recurso', valor: 1, recurso: 'fe' }), {
    pd: 0,
    pv: 0,
    recursos: { fe: 1 },
  });
  assert.deepEqual(costBag({ tipo: 'nenhum' }), emptyCostBag());
  const sum = addCostBags(costBag({ tipo: 'recurso', valor: 1, recurso: 'fe' }), {
    pd: 2,
    pv: 1,
    recursos: { fe: 2, impeto: 1 },
  });
  assert.deepEqual(sum, { pd: 2, pv: 1, recursos: { fe: 3, impeto: 1 } });
  assert.deepEqual(costShortfall(sum, { pd: 1, pv: 0, recursos: { fe: 3 } }), [
    'pd',
    'pv',
    'impeto',
  ]);
  assert.deepEqual(costShortfall(sum, { pd: 2, pv: 1, recursos: { fe: 3, impeto: 1 } }), []);
});

test('janela: custos em PV e em recurso, com o motivo de indisponível', () => {
  const rich = model({ pd: 0, pv: 10, recursos: { furia: 3 } });
  const by = Object.fromEntries(rich.abilities.map((a) => [a.key, a]));
  assert.deepEqual(by.furia.cost, { pd: 0, pv: 0, recursos: { furia: 2 } });
  assert.equal(by.furia.available, true);
  assert.equal(by.sangue.available, true);
  const poor = model({ pd: 0, pv: 2, recursos: { furia: 1 } });
  const reasons = Object.fromEntries(poor.abilities.map((a) => [a.key, a.reason]));
  assert.deepEqual(reasons, { furia: 'furia', sangue: 'pv' });
});

test('janela: soma os custos marcados por recurso e mostra o que sobra', () => {
  const m = model({ pd: 0, pv: 10, recursos: { furia: 3 } });
  const result = evaluateSelection(m, { ...emptySelection(7), active: ['furia', 'sangue'] });
  assert.equal(result.pvCost, 3);
  assert.equal(result.pvLeft, 7);
  assert.deepEqual(result.resourceCosts, { furia: 2 });
  assert.deepEqual(result.resourceLeft, { furia: 1 });
  assert.equal(result.impetoCost, 0);
  assert.equal(result.valid, true);
  assert.deepEqual(result.rolledSides.slice(2).sort(), [10, 8].sort());
});

test('janela: atalho antigo de ímpeto continua valendo junto com os recursos', () => {
  const m = model({ impeto: 2, pd: 0, recursos: { furia: 0 } });
  assert.equal(m.wallet.recursos.impeto, 2);
  assert.equal(m.wallet.recursos.furia, 0);
});

test('activeBoosts cobra PV e recursos e confere o saldo de cada um', () => {
  const diceOptions = dialogDiceOptions(entries, { skillKey: 'luta' });
  const boosts = activeBoosts(['furia', 'sangue'], {
    skillKey: 'luta',
    pd: 0,
    pv: 5,
    recursos: { furia: 2 },
    diceOptions,
  });
  assert.deepEqual(
    [boosts.extraDice, boosts.pvCost, boosts.resourceCosts, boosts.used],
    [[8, 10], 3, { furia: 2 }, ['furia', 'sangue']],
  );
  const poor = activeBoosts(['furia', 'sangue'], {
    skillKey: 'luta',
    pd: 0,
    pv: 2,
    recursos: { furia: 1 },
    diceOptions,
  });
  assert.deepEqual(poor.used, []);
});

// ---------- Tipo de ataque ----------

test('dados extras de ataque só aparecem no ataque do tipo certo', () => {
  const keys = (testKind) =>
    dialogDiceOptions(entries, { skillKey: 'luta', testKind }).map((o) => o.key);
  assert.deepEqual(keys('qualquer'), ['furia', 'sangue']);
  assert.deepEqual(keys('ataqueCorpo'), ['furia', 'sangue', 'lamina']);
  assert.deepEqual(keys('ataqueDistancia'), ['furia', 'sangue', 'flecha']);
  assert.equal(weaponTestKind({ tipo: 'corpo' }), 'ataqueCorpo');
  assert.equal(weaponTestKind({ tipo: 'distancia' }), 'ataqueDistancia');
  assert.equal(weaponTestKind(undefined), 'ataqueDistancia');
});

// ---------- Passo condicional ----------

test('conditionalStepMods: passo no dado da perícia só enquanto a condição vale', () => {
  const list = collectEffects([
    ability('b', 'Instinto', [
      { id: 'pv', tipo: 'passoCondicional', params: { condicao: 'pvMetade', passos: 1 } },
      { id: 'pd', tipo: 'passoCondicional', params: { condicao: 'pdMetade', passos: 2 } },
    ]),
  ]);
  assert.deepEqual(conditionalStepMods(list, { pv: 7, pvMax: 15, pd: 10, pdMax: 12 }), [
    { target: 'skill', steps: 1 },
  ]);
  assert.deepEqual(conditionalStepMods(list, { pv: 8, pvMax: 15, pd: 6, pdMax: 12 }), [
    { target: 'skill', steps: 2 },
  ]);
  assert.deepEqual(conditionalStepMods(list, { pv: 15, pvMax: 15, pd: 12, pdMax: 12 }), []);
  assert.deepEqual(conditionalStepMods([], { pv: 1, pvMax: 15, pd: 1, pdMax: 12 }), []);
});

// ---------- Dados bônus ----------

test('pickBonusDice usa os maiores; spendBonusDice tira um de cada da reserva', () => {
  assert.deepEqual(pickBonusDice([6, 8, 6, 4], 2), [8, 6]);
  assert.deepEqual(pickBonusDice([6, 8], 5), [8, 6]);
  assert.deepEqual(pickBonusDice([6, 'x', 5], 3), [6]);
  assert.deepEqual(pickBonusDice(undefined, 2), []);
  assert.deepEqual(spendBonusDice([6, 8, 6, 4], [8, 6]), [6, 4]);
  assert.deepEqual(spendBonusDice([6], [8]), [6]);
});

test('janela: a reserva de dados bônus ocupa espaços e vai para as opções do teste', () => {
  const m = model({ pd: 0, pv: 10, recursos: { furia: 3 }, dadosBonus: [6, 8, 6] });
  assert.deepEqual(m.reserva, { dice: [8, 6, 6] });
  const result = evaluateSelection(m, { ...emptySelection(7), reserva: 2 });
  assert.deepEqual(result.reserva, [8, 6]);
  assert.deepEqual(
    result.slots.filter((s) => s.kind === 'reserva').map((s) => s.sides),
    [8, 6],
  );
  assert.equal(selectionToOptions(m, { ...emptySelection(7), reserva: 2 }).useBonusDice, 2);
  assert.equal('useBonusDice' in selectionToOptions(m, emptySelection(7)), false);
});

test('janela: a reserva só usa os espaços que sobram depois das habilidades', () => {
  const m = model({ pd: 0, pv: 10, recursos: { furia: 3 }, dadosBonus: [6, 6, 6] });
  const result = evaluateSelection(m, { ...emptySelection(7), active: ['furia'], reserva: 3 });
  assert.deepEqual(result.reserva, [6]);
  assert.equal(result.selection.reserva, 1);
  // Sem reserva, a seção não aparece
  assert.equal(model({ pd: 0 }).reserva, null);
});
