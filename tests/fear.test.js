import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FEAR_STEPS,
  fearStepShift,
  increaseFear,
  resolveFearOptions,
} from '../scripts/rolls/fear.js';
import { resolveTest } from '../scripts/rolls/test.js';
import { fixedRng } from './helpers.js';

// Ordem dos valores: dados do teste e, por último, o dado de pavor
const run = (opts, values) => resolveTest({ ...opts, rng: fixedRng(values) });

test('exemplos do livro: pavor anula dados menores', () => {
  const um = run({ attrDie: 8, skillDie: 8, fearDie: 6 }, [7, 2, 4]);
  assert.equal(um.total, 7);
  assert.deepEqual(
    um.dice.map((d) => d.annulled),
    [false, true],
  );

  const dois = run({ attrDie: 6, skillDie: 6, fearDie: 6 }, [3, 1, 5]);
  assert.equal(dois.total, 0);
  assert.equal(dois.criticalFailure, true);
  assert.equal(dois.devouredAll, true);

  const tres = run({ attrDie: 8, skillDie: 8, fearDie: 6 }, [6, 5, 3]);
  assert.equal(tres.total, 11);
  assert.equal(tres.criticalFailure, false);
});

test('pavor 5 com 4, 3 e 5: devora o 4 e o 3; só o 5 soma, mas RA e RB veem os três', () => {
  const r = run({ attrDie: 8, skillDie: 8, extraDice: [6], fearDie: 8 }, [4, 3, 5, 5]);
  assert.equal(r.total, 5);
  assert.equal(r.highRoll, 5);
  assert.equal(r.lowRoll, 3);
  assert.equal(r.fear.devoured, 2);
});

test('dado igual ao pavor não é anulado', () => {
  const r = run({ attrDie: 6, skillDie: 6, fearDie: 4 }, [4, 5, 4]);
  assert.equal(r.total, 9);
  assert.equal(r.fear.devoured, 0);
});

test('o dado de pavor fica fora dos limites de 4 rolados e 3 somados', () => {
  const r = run({ attrDie: 6, skillDie: 6, extraDice: [6, 6], fearDie: 4 }, [2, 3, 4, 5, 1]);
  assert.equal(r.dice.length, 4);
  assert.equal(r.total, 4 + 5 + 3); // soma só os 3 maiores
  assert.equal(r.fear.sides, 4);
});

test('dados anulados não contam para sucesso crítico', () => {
  const sem = run({ attrDie: 8, skillDie: 8, fearDie: 8 }, [6, 6, 7]);
  assert.equal(sem.criticalSuccess, false);
  assert.equal(sem.devouredAll, true);

  const com = run({ attrDie: 8, skillDie: 8, extraDice: [8], fearDie: 4 }, [6, 6, 7, 2]);
  assert.equal(com.criticalSuccess, true);
});

test('dados anulados não somam, mas continuam valendo para RA e RB', () => {
  const r = run({ attrDie: 8, skillDie: 8, extraDice: [8], fearDie: 8 }, [8, 2, 3, 5]);
  assert.equal(r.total, 8);
  assert.equal(r.highRoll, 8);
  assert.equal(r.lowRoll, 2);
});

test('o pavor só muda a soma: RA e RB são os mesmos com e sem pavor', () => {
  const rolls = [9, 3, 5];
  const sem = run({ attrDie: 10, skillDie: 10, extraDice: [8] }, rolls);
  const com = run({ attrDie: 10, skillDie: 10, extraDice: [8], fearDie: 6 }, [...rolls, 6]);
  assert.equal(sem.total, 17);
  assert.equal(com.total, 9); // 3 e 5 foram anulados
  assert.equal(com.highRoll, sem.highRoll);
  assert.equal(com.lowRoll, sem.lowRoll);
  assert.deepEqual([com.highRoll, com.lowRoll], [9, 3]);
});

test('devora tudo com 4 dados: falha crítica, RA = maior e RB = 2º menor (3 maiores dados)', () => {
  const r = run({ attrDie: 10, skillDie: 10, extraDice: [8, 8], fearDie: 12 }, [2, 3, 4, 6, 9]);
  assert.equal(r.devouredAll, true);
  assert.equal(r.criticalFailure, true);
  assert.equal(r.success, false);
  assert.equal(r.total, 0);
  assert.equal(r.highRoll, 6);
  assert.equal(r.lowRoll, 3);
});

test('pares anulados não formam crítico, mesmo com RA e RB contando-os', () => {
  const r = run({ attrDie: 10, skillDie: 10, extraDice: [10], fearDie: 8 }, [7, 7, 9, 8]);
  assert.equal(r.criticalSuccess, false);
  assert.equal(r.highRoll, 9);
  assert.equal(r.lowRoll, 7);
  assert.equal(r.total, 9);
});

test('pavor d20 anula tudo o que for menor que o valor rolado', () => {
  const r = run({ attrDie: 8, skillDie: 8, fearDie: 20 }, [8, 8, 15]);
  assert.equal(r.fear.sides, 20);
  assert.equal(r.devouredAll, true);
  assert.equal(r.criticalFailure, true);
  assert.equal(run({ attrDie: 8, skillDie: 8, fearDie: 20 }, [8, 8, 1]).total, 16);
});

test('1 no dado de pavor encerra o efeito e não anula nada', () => {
  const r = run({ attrDie: 6, skillDie: 6, fearDie: 6 }, [2, 3, 1]);
  assert.equal(r.fear.ended, true);
  assert.equal(r.total, 5);
  assert.equal(run({ attrDie: 6, skillDie: 6, fearDie: 6 }, [2, 3, 2]).fear.ended, false);
});

test('sem pavor, o teste não muda', () => {
  const r = run({ attrDie: 6, skillDie: 6 }, [2, 3]);
  assert.equal(r.fear, null);
  assert.equal(r.devouredAll, false);
});

test('aumentar o pavor: começa em d6, sobe um passo e para em d20', () => {
  assert.deepEqual([0, 4, 6, 8, 10, 12, 20].map(increaseFear), [6, 6, 8, 10, 12, 20, 20]);
});

test('resolveFearOptions: sem pavor ou ignorando, nada muda', () => {
  const nada = { fearDie: null, bonusDie: null, pdCost: 0 };
  assert.deepEqual(resolveFearOptions({ fearDie: 0, control: true, embrace: true }), nada);
  assert.deepEqual(resolveFearOptions({ fearDie: 8, ignore: true }), nada);
});

test('resolveFearOptions: controlar reduz um passo por 1 PD, sem efeito em d4', () => {
  assert.deepEqual(resolveFearOptions({ fearDie: 8, control: true }), {
    fearDie: 6,
    bonusDie: null,
    pdCost: 1,
  });
  assert.deepEqual(resolveFearOptions({ fearDie: 4, control: true }), {
    fearDie: 4,
    bonusDie: null,
    pdCost: 0,
  });
});

test('resolveFearOptions: abraçar converte o dado em bônus por 5 PD', () => {
  assert.deepEqual(resolveFearOptions({ fearDie: 8, embrace: true }), {
    fearDie: null,
    bonusDie: 8,
    pdCost: 5,
  });
  assert.deepEqual(resolveFearOptions({ fearDie: 8, control: true, embrace: true }), {
    fearDie: null,
    bonusDie: 6,
    pdCost: 6,
  });
});

test('resolveFearOptions: PD insuficientes lançam erro', () => {
  assert.throws(() => resolveFearOptions({ fearDie: 6, embrace: true, pd: 4 }), RangeError);
  assert.doesNotThrow(() => resolveFearOptions({ fearDie: 6, embrace: true, pd: 5 }));
});

test('escada do pavor: d4 a d12 e d20, sem sair das pontas', () => {
  assert.deepEqual([...FEAR_STEPS], [4, 6, 8, 10, 12, 20]);
  assert.equal(fearStepShift(12, 1), 20);
  assert.equal(fearStepShift(20, 1), 20);
  assert.equal(fearStepShift(20, -1), 12);
  assert.equal(fearStepShift(4, -1), 4);
  assert.equal(fearStepShift(6, 2), 10);
  assert.throws(() => fearStepShift(7, 1), RangeError);
});

test('controlar o pavor d20 reduz para d12', () => {
  assert.equal(resolveFearOptions({ fearDie: 20, control: true }).fearDie, 12);
  assert.deepEqual(resolveFearOptions({ fearDie: 20, embrace: true }), {
    fearDie: null,
    bonusDie: 20,
    pdCost: 5,
  });
});
