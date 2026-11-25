// Teste de lesão: DT da cena, dano não letal e resultado.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  injuryDT,
  injuryTestOptions,
  injuryOutcome,
  resolveInjuryTest,
  outcomeEffects,
  LESIONS,
  lookupLesion,
  pickLesion,
  lesionRollCount,
  bestLesionRoll,
  applyInjuryOutcome,
  applyLesion,
} from '../scripts/rolls/injury.js';
import { fixedRng } from './helpers.js';
import { tableEffect } from '../scripts/rolls/condition-tables.js';

/** Lesão sorteada com o efeito que a ficha recebe (como faz health.js). */
const lesion = (state, value) => {
  const entry = lookupLesion(value);
  return applyLesion(state, entry, tableEffect('lesao', entry, `id${value}`));
};
const keys = (state) => state.efeitos.map((e) => e.chave);

const base = (extra = {}) => ({
  pv: 0,
  pvMax: 10,
  inconsciente: false,
  moribundo: false,
  morto: false,
  morteLenta: false,
  efeitos: [],
  ...extra,
});

test('a DT começa em 7 e sobe 3 por teste já feito na cena', () => {
  assert.deepEqual([0, 1, 2, 3].map(injuryDT), [7, 10, 13, 16]);
  assert.throws(() => injuryDT(-1), RangeError);
});

test('dano não letal adiciona 1d6 ao teste', () => {
  assert.deepEqual(injuryTestOptions({ previousTests: 1, nonLethal: true }), {
    dt: 10,
    extraDice: [6],
  });
  assert.deepEqual(injuryTestOptions().extraDice, []);
});

test('resolveInjuryTest usa a DT da cena e classifica o resultado', () => {
  const ok = resolveInjuryTest({ attrDie: 6, skillDie: 6, rng: fixedRng([3, 4]) });
  assert.equal(ok.dt, 7);
  assert.equal(ok.outcome, 'success');

  const falha = resolveInjuryTest({
    attrDie: 6,
    skillDie: 6,
    previousTests: 1,
    rng: fixedRng([3, 4]),
  });
  assert.equal(falha.dt, 10);
  assert.equal(falha.outcome, 'failure');
});

test('críticos do teste de lesão', () => {
  const crit = resolveInjuryTest({
    attrDie: 8,
    skillDie: 8,
    previousTests: 5,
    rng: fixedRng([6, 6]),
  });
  assert.equal(crit.outcome, 'criticalSuccess');
  const pior = resolveInjuryTest({ attrDie: 6, skillDie: 6, rng: fixedRng([1, 1]) });
  assert.equal(pior.outcome, 'criticalFailure');
});

test('o dado extra de dano não letal entra no teste', () => {
  const r = resolveInjuryTest({
    attrDie: 6,
    skillDie: 6,
    nonLethal: true,
    rng: fixedRng([1, 1, 3]),
  });
  assert.equal(r.test.dice.length, 3);
  assert.equal(r.outcome, 'failure'); // 1+3 = 4 < 7, e não são todos 1
});

test('injuryOutcome cobre as quatro faixas', () => {
  assert.equal(injuryOutcome({ criticalFailure: true }), 'criticalFailure');
  assert.equal(injuryOutcome({ criticalSuccess: true }), 'criticalSuccess');
  assert.equal(injuryOutcome({ success: true }), 'success');
  assert.equal(injuryOutcome({ success: false }), 'failure');
});

test('outcomeEffects devolve cópias das chaves de efeito', () => {
  const efeitos = outcomeEffects('success');
  efeitos.push('x');
  assert.deepEqual(outcomeEffects('success'), ['inconscienteMoribundo']);
});

test('a tabela cobre de 1 a 20 sem buracos nem sobreposição', () => {
  for (let v = 1; v <= 20; v++) {
    assert.equal(LESIONS.filter((e) => v >= e.min && v <= e.max).length, 1, `valor ${v}`);
  }
});

test('lookupLesion: faixas e valores extremos', () => {
  assert.equal(lookupLesion(1).key, 'morteSubita');
  assert.equal(lookupLesion(4).key, 'morteSubita');
  assert.equal(lookupLesion(5).key, 'morteLenta');
  assert.equal(lookupLesion(9).key, 'morteLenta');
  assert.equal(lookupLesion(10).key, 'lacearacaoProfunda');
  assert.equal(lookupLesion(19).key, 'contusao');
  assert.equal(lookupLesion(20).key, 'surtoAdrenalina');
  assert.equal(lookupLesion(25).key, 'surtoAdrenalina');
  assert.equal(lookupLesion(-3).key, 'morteSubita');
});

test('lesão permanente repetida pede nova rolagem, exceto laceração profunda', () => {
  assert.equal(pickLesion(11, ['semOlho']).reroll, true);
  assert.equal(pickLesion(11, []).reroll, false);
  assert.equal(pickLesion(10, ['lacearacaoProfunda']).reroll, false);
  assert.equal(pickLesion(19, []).reroll, false);
});

test('dano não letal rola 2d20 e fica o melhor', () => {
  assert.equal(lesionRollCount(false), 1);
  assert.equal(lesionRollCount(true), 2);
  assert.equal(bestLesionRoll([3, 12]), 12);
  assert.throws(() => bestLesionRoll([]), RangeError);
});

test('sucesso crítico: recupera 1 PV e sai de inconsciente e moribundo', () => {
  const s = applyInjuryOutcome(base({ inconsciente: true, moribundo: true }), 'criticalSuccess');
  assert.deepEqual([s.pv, s.inconsciente, s.moribundo], [1, false, false]);
});

test('sucesso: fica inconsciente e moribundo', () => {
  const s = applyInjuryOutcome(base(), 'success');
  assert.deepEqual([s.inconsciente, s.moribundo, s.morto], [true, true, false]);
});

test('falha não muda o estado (a lesão vem depois); falha crítica mata', () => {
  assert.deepEqual(applyInjuryOutcome(base(), 'failure'), base());
  assert.equal(applyInjuryOutcome(base(), 'criticalFailure').morto, true);
  assert.throws(() => applyInjuryOutcome(base(), 'x'), RangeError);
});

test('applyInjuryOutcome não altera o objeto original', () => {
  const original = base();
  applyInjuryOutcome(original, 'success');
  assert.equal(original.moribundo, false);
});

test('morte súbita mata; morte lenta cura 1 PV, acorda, marca a morte lenta e tira o moribundo', () => {
  assert.equal(applyLesion(base(), lookupLesion(2)).morto, true);
  const s = applyLesion(base({ inconsciente: true, moribundo: true }), lookupLesion(7));
  assert.deepEqual([s.pv, s.inconsciente, s.moribundo, s.morteLenta], [1, false, false, true]);
});

test('laceração profunda reduz o PV máximo em 2 (acumula) e tira o moribundo', () => {
  let s = base({ pv: 0, pvMax: 10, moribundo: true });
  s = lesion(s, 10);
  s = lesion(s, 10);
  assert.deepEqual(
    [s.pvMax, s.pv, keys(s), s.moribundo],
    [6, 0, ['lesao:lacearacaoProfunda', 'lesao:lacearacaoProfunda'], false],
  );
});

test('qualquer lesão de quem sobrevive tira o moribundo, mas não o inconsciente', () => {
  const dying = () => base({ pv: 0, inconsciente: true, moribundo: true });
  for (const roll of [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]) {
    const s = applyLesion(dying(), lookupLesion(roll));
    assert.equal(s.moribundo, false, `d20 = ${roll}`);
    assert.equal(s.morto, false, `d20 = ${roll}`);
  }
  // contusão e as lesões permanentes não acordam ninguém
  assert.equal(applyLesion(dying(), lookupLesion(19)).inconsciente, true);
  assert.equal(applyLesion(dying(), lookupLesion(11)).inconsciente, true);
  // quem não estava moribundo continua sem estar
  assert.equal(applyLesion(base(), lookupLesion(11)).moribundo, false);
});

test('a morte súbita não mexe no moribundo (o personagem está morto)', () => {
  const s = applyLesion(base({ moribundo: true }), lookupLesion(1));
  assert.deepEqual([s.morto, s.moribundo], [true, true]);
});

test('laceração limita o PV atual ao novo máximo e o máximo não fica negativo', () => {
  const s = applyLesion(base({ pv: 5, pvMax: 6 }), lookupLesion(10));
  assert.deepEqual([s.pv, s.pvMax], [4, 4]);
  assert.equal(applyLesion(base({ pvMax: 1 }), lookupLesion(10)).pvMax, 0);
});

test('lesões permanentes e a contusão viram efeitos; a contusão não se repete; adrenalina não', () => {
  const s = lesion(base(), 11);
  assert.deepEqual(keys(s), ['lesao:semOlho']);
  const c = lesion(base(), 19);
  assert.deepEqual(keys(c), ['lesao:contusao']);
  assert.deepEqual(keys(lesion(c, 19)), ['lesao:contusao']);
  assert.deepEqual(keys(applyLesion(base(), lookupLesion(20))), []);
  // Sem o efeito (chamada antiga): nada entra na lista
  assert.deepEqual(keys(applyLesion(base(), lookupLesion(11))), []);
  // A lista original não muda
  const original = base();
  lesion(original, 11);
  assert.deepEqual(original.efeitos, []);
  const a = applyLesion(base({ pvMax: 1, pv: 1 }), lookupLesion(20));
  assert.equal(a.pv, 1); // limitado ao PV máximo
  assert.equal(applyLesion(base(), lookupLesion(20)).pv, 1);
});
