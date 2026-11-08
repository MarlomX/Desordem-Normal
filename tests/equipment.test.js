import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARMOR_REDUCTION,
  armorSummary,
  pickArmorToSpend,
  reduceDamageWithArmor,
  handsInUse,
  weaponSkill,
  weaponDamageLabel,
  itemUse,
  itemUseChanges,
} from '../scripts/rolls/equipment.js';

const armor = (extra = {}) => ({ id: 'a', pontos: 1, gastos: 0, vestida: true, ...extra });

test('cada ponto de armadura reduz o dano em 10, sem ficar negativo', () => {
  assert.equal(ARMOR_REDUCTION, 10);
  assert.equal(reduceDamageWithArmor(14), 4);
  assert.equal(reduceDamageWithArmor(10), 0);
  assert.equal(reduceDamageWithArmor(3), 0);
});

test('armorSummary conta só as armaduras vestidas e os pontos que restam', () => {
  const list = [
    armor({ pontos: 2, gastos: 1 }),
    armor({ id: 'b', pontos: 3, vestida: false }),
    armor({ id: 'c', pontos: 1, gastos: 1 }),
  ];
  assert.deepEqual(armorSummary(list), { total: 3, available: 1 });
  assert.deepEqual(armorSummary([]), { total: 0, available: 0 });
});

test('pickArmorToSpend escolhe a primeira vestida com pontos', () => {
  const list = [
    armor({ id: 'x', gastos: 1 }),
    armor({ id: 'y', vestida: false }),
    armor({ id: 'z', pontos: 2, gastos: 1 }),
  ];
  assert.equal(pickArmorToSpend(list), 'z');
  assert.equal(pickArmorToSpend([armor({ gastos: 1 })]), null);
  assert.equal(pickArmorToSpend([]), null);
});

test('handsInUse soma as mãos das armas empunhadas e avisa quando passa de duas', () => {
  assert.deepEqual(
    handsInUse([
      { maos: 1, empunhada: true },
      { maos: 1, empunhada: true },
    ]),
    {
      used: 2,
      over: false,
    },
  );
  assert.deepEqual(
    handsInUse([
      { maos: 2, empunhada: true },
      { maos: 1, empunhada: true },
    ]),
    {
      used: 3,
      over: true,
    },
  );
  assert.deepEqual(handsInUse([{ maos: 2, empunhada: false }]), { used: 0, over: false });
});

test('weaponSkill usa a perícia da arma ou o padrão do tipo', () => {
  assert.equal(weaponSkill({ tipo: 'corpo', pericia: '' }), 'luta');
  assert.equal(weaponSkill({ tipo: 'distancia', pericia: '' }), 'pontaria');
  assert.equal(weaponSkill({ tipo: 'distancia', pericia: 'sobrevivencia' }), 'sobrevivencia');
});

test('weaponDamageLabel mostra RA com o modificador', () => {
  assert.equal(weaponDamageLabel(0), 'RA');
  assert.equal(weaponDamageLabel(3), 'RA+3');
  assert.equal(weaponDamageLabel(-1), 'RA−1');
});

test('itemUse: limite de usos, consumível ou sem uso', () => {
  assert.deepEqual(itemUse({ usosMax: 3, usos: 2, consumivel: false, quantidade: 1 }), {
    kind: 'usos',
    remaining: 2,
    max: 3,
    canUse: true,
  });
  assert.equal(itemUse({ usosMax: 3, usos: 0, consumivel: true, quantidade: 5 }).canUse, false);
  assert.deepEqual(itemUse({ usosMax: 0, usos: 0, consumivel: true, quantidade: 2 }), {
    kind: 'quantidade',
    remaining: 2,
    max: null,
    canUse: true,
  });
  assert.equal(itemUse({ usosMax: 0, usos: 0, consumivel: false, quantidade: 4 }).kind, null);
});

test('itemUseChanges gasta um uso ou uma unidade, ou devolve null', () => {
  assert.deepEqual(itemUseChanges({ usosMax: 3, usos: 2, consumivel: false, quantidade: 1 }), {
    'system.usos': 1,
  });
  assert.deepEqual(itemUseChanges({ usosMax: 0, usos: 0, consumivel: true, quantidade: 2 }), {
    'system.quantidade': 1,
  });
  assert.equal(itemUseChanges({ usosMax: 0, usos: 0, consumivel: true, quantidade: 0 }), null);
  assert.equal(itemUseChanges({ usosMax: 0, usos: 0, consumivel: false, quantidade: 3 }), null);
});
