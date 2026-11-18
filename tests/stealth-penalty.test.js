import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyPenaltyTo,
  createPenaltyFlag,
  penaltyAllows,
  penaltyBarView,
  penaltyScene,
} from '../scripts/rolls/chase.js';

test('penalidade da perseguição continua igual (sem cena nem alvos)', () => {
  const flag = createPenaltyFlag({ tipo: 'pv', valor: 3 });
  assert.deepEqual(flag, { tipo: 'pv', valor: 3, formula: '', aplicados: [] });
  assert.equal(penaltyScene(flag), 'perseguicao');
  assert.equal(penaltyAllows(flag, 'qualquer'), true);
  // Cena desconhecida também não muda nada
  assert.equal('cena' in createPenaltyFlag({ tipo: 'pv', valor: 3, cena: 'outra' }), false);
});

test('consequência da furtividade: só os encontrados quando foi postada', () => {
  const flag = createPenaltyFlag({
    tipo: 'pd',
    valor: 4,
    formula: '1d6',
    cena: 'furtividade',
    alvos: ['a', 'b'],
  });
  assert.equal(penaltyScene(flag), 'furtividade');
  assert.deepEqual(flag.alvos, ['a', 'b']);
  assert.equal(penaltyAllows(flag, 'a'), true);
  assert.equal(penaltyAllows(flag, 'c'), false);

  const view = penaltyBarView(flag, [
    { combatantId: 'a', name: 'Ana' },
    { combatantId: 'c', name: 'Caio' },
  ]);
  assert.deepEqual(
    view.rows.map((row) => row.combatantId),
    ['a'],
  );
  assert.equal(view.multiple, false);

  // Uso único continua valendo
  const once = applyPenaltyTo(flag, 'a', 10);
  assert.equal(once.next, 6);
  assert.equal(applyPenaltyTo(once.flag, 'a', 6), null);
  assert.deepEqual(once.flag.alvos, ['a', 'b']);
});

test('alvos mal formados viram lista vazia (ninguém recebe o botão)', () => {
  const flag = createPenaltyFlag({ tipo: 'pv', valor: 2, cena: 'furtividade', alvos: 'x' });
  assert.deepEqual(flag.alvos, []);
  assert.equal(penaltyAllows(flag, 'a'), false);
});

test('consequência sem ninguém encontrado: o cartão sai sem botões', () => {
  const flag = createPenaltyFlag({ tipo: 'pv', valor: 3, cena: 'furtividade', alvos: [] });
  assert.deepEqual(flag.alvos, []);
  const view = penaltyBarView(flag, [
    { combatantId: 'a', name: 'Ana' },
    { combatantId: 'b', name: 'Bia' },
  ]);
  assert.deepEqual(view.rows, []);
});
