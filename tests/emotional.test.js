import test from 'node:test';
import assert from 'node:assert/strict';
import {
  traumaDT,
  traumaOutcome,
  TRAUMAS,
  lookupTrauma,
  pickTrauma,
  traumaModifier,
  extraEmotionalDamage,
  applyEmotionalDamage,
  applyTrauma,
} from '../scripts/rolls/emotional.js';

const base = (extra = {}) => ({
  pd: 5,
  pdMax: 10,
  pavor: 0,
  estupor: false,
  colapso: false,
  traumas: [],
  ...extra,
});

test('a DT do trauma começa em 7 e sobe 3 por teste na cena', () => {
  assert.deepEqual([0, 1, 2, 3].map(traumaDT), [7, 10, 13, 16]);
  assert.throws(() => traumaDT(-1), RangeError);
});

test('traumaOutcome: só sucesso ou falha', () => {
  assert.equal(traumaOutcome({ success: true }), 'success');
  assert.equal(traumaOutcome({ success: false }), 'failure');
});

test('a tabela cobre de 1 a 20 sem buracos nem sobreposição', () => {
  for (let v = 1; v <= 20; v++) {
    assert.equal(TRAUMAS.filter((e) => v >= e.min && v <= e.max).length, 1, `valor ${v}`);
  }
  assert.equal(lookupTrauma(25).key, 'injecaoAnimo');
  assert.equal(lookupTrauma(0).key, 'colapsoTotal');
});

test('faixas da tabela de traumas', () => {
  const chaves = [4, 6, 8, 10, 12, 14, 17, 19, 20].map((v) => lookupTrauma(v).key);
  assert.deepEqual(chaves, [
    'colapsoTotal',
    'estressePosTraumatico',
    'degradacaoCognitiva',
    'maculaPsiquica',
    'chagaAlma',
    'retracaoDefensiva',
    'panico',
    'estupor',
    'injecaoAnimo',
  ]);
});

test('trauma persistente repetido pede nova rolagem, exceto chaga da alma e os de efeito imediato', () => {
  assert.equal(pickTrauma(7, ['degradacaoCognitiva']).reroll, true);
  assert.equal(pickTrauma(7, []).reroll, false);
  assert.equal(pickTrauma(11, ['chagaAlma']).reroll, false);
  assert.equal(pickTrauma(16, []).reroll, false);
  assert.equal(pickTrauma(18, []).reroll, false);
});

test('modificadores por atributo e perícia', () => {
  assert.equal(traumaModifier(['degradacaoCognitiva'], { attrKey: 'mente' }), -1);
  assert.equal(traumaModifier(['degradacaoCognitiva'], { attrKey: 'fisico' }), 0);
  assert.equal(traumaModifier(['maculaPsiquica'], { attrKey: 'emocao' }), -1);
  assert.equal(traumaModifier(['retracaoDefensiva'], { skillKey: 'persuasao' }), -2);
  assert.equal(traumaModifier(['retracaoDefensiva'], { skillKey: 'intuicao' }), -2);
  assert.equal(
    traumaModifier(['maculaPsiquica', 'retracaoDefensiva'], {
      attrKey: 'emocao',
      skillKey: 'intuicao',
    }),
    -3,
  );
  assert.equal(traumaModifier(undefined, { attrKey: 'mente' }), 0);
});

test('estresse pós-traumático soma 1 a cada dano emocional', () => {
  assert.equal(extraEmotionalDamage(['estressePosTraumatico']), 1);
  assert.equal(extraEmotionalDamage([]), 0);
  const r = applyEmotionalDamage({ current: 5, amount: 2, owned: ['estressePosTraumatico'] });
  assert.deepEqual(r, { before: 5, after: 2, amount: 3, needsTraumaTest: false });
  assert.equal(
    applyEmotionalDamage({ current: 5, amount: 0, owned: ['estressePosTraumatico'] }).amount,
    0,
  );
});

test('PD em 0 (ou já em 0 e sofrendo dano) exige teste de trauma', () => {
  assert.equal(applyEmotionalDamage({ current: 3, amount: 3 }).needsTraumaTest, true);
  assert.equal(applyEmotionalDamage({ current: 3, amount: 9 }).after, 0);
  assert.equal(applyEmotionalDamage({ current: 0, amount: 1 }).needsTraumaTest, true);
  assert.equal(applyEmotionalDamage({ current: 0, amount: 0 }).needsTraumaTest, false);
  assert.throws(() => applyEmotionalDamage({ current: 3, amount: -1 }), RangeError);
});

test('colapso total, estupor e pânico', () => {
  assert.equal(applyTrauma(base(), lookupTrauma(2)).colapso, true);
  assert.equal(applyTrauma(base(), lookupTrauma(18)).estupor, true);
  assert.equal(applyTrauma(base(), lookupTrauma(16)).pavor, 6);
  assert.equal(applyTrauma(base({ pavor: 6 }), lookupTrauma(16)).pavor, 8);
  assert.equal(applyTrauma(base({ pavor: 12 }), lookupTrauma(16)).pavor, 20);
  assert.equal(applyTrauma(base({ pavor: 20 }), lookupTrauma(16)).pavor, 20);
});

test('chaga da alma reduz o PD máximo em 2 e acumula', () => {
  let s = base({ pd: 0, pdMax: 10 });
  s = applyTrauma(s, lookupTrauma(11));
  s = applyTrauma(s, lookupTrauma(12));
  assert.deepEqual([s.pdMax, s.pd, s.traumas], [6, 0, ['chagaAlma', 'chagaAlma']]);
  const limitado = applyTrauma(base({ pd: 9, pdMax: 10 }), lookupTrauma(11));
  assert.deepEqual([limitado.pd, limitado.pdMax], [8, 8]);
});

test('traumas persistentes entram na lista; injeção de ânimo cura 1 PD sem passar do máximo', () => {
  assert.deepEqual(applyTrauma(base(), lookupTrauma(8)).traumas, ['degradacaoCognitiva']);
  assert.equal(applyTrauma(base({ pd: 0 }), lookupTrauma(20)).pd, 1);
  assert.equal(applyTrauma(base({ pd: 10 }), lookupTrauma(20)).pd, 10);
  assert.deepEqual(applyTrauma(base(), lookupTrauma(20)).traumas, []);
});

test('applyTrauma não altera o estado original', () => {
  const original = base();
  applyTrauma(original, lookupTrauma(8));
  assert.deepEqual(original.traumas, []);
});
