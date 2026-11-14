import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DISASTERS,
  lookupDisaster,
  disasterByKey,
  disasterExtraDie,
  disasterStepEffect,
  applyDisaster,
  disasterSync,
} from '../scripts/rolls/critical-failure.js';
import { buildTableResultContext } from '../scripts/rolls/presenter.js';

const base = (extra = {}) => ({ pv: 10, pd: 8, efeitos: [], ...extra });

test('a tabela tem os 8 resultados do d8, um por número', () => {
  assert.deepEqual(
    DISASTERS.map((e) => e.n),
    [1, 2, 3, 4, 5, 6, 7, 8],
  );
  assert.equal(lookupDisaster(5).key, 'acidente');
  assert.equal(disasterByKey('perda').n, 7);
  assert.throws(() => lookupDisaster(0), RangeError);
  assert.throws(() => lookupDisaster(9), RangeError);
});

test('só os efeitos de PV e PD rolam um d4', () => {
  assert.deepEqual(DISASTERS.map(disasterExtraDie), [null, null, null, null, 4, 4, null, null]);
});

test('machucado, desatenção e irritação reduzem Físico, Mente e Emoção em um passo até o fim da cena', () => {
  const attrs = [2, 3, 4].map((n) => lookupDisaster(n).attr);
  assert.deepEqual(attrs, ['fisico', 'mente', 'emocao']);
  const effect = disasterStepEffect(lookupDisaster(2), { name: 'N', description: 'D' });
  assert.deepEqual(effect, {
    nome: 'N',
    descricao: 'D',
    atributo: 'fisico',
    passos: -1,
    fimDeCena: true,
  });
});

test('o efeito de passo é acrescentado à lista sem alterar a original', () => {
  const state = base({ efeitos: [{ nome: 'x' }] });
  const effect = disasterStepEffect(lookupDisaster(3), { name: 'N', description: 'D' });
  const next = applyDisaster(state, lookupDisaster(3), { effect });
  assert.equal(next.efeitos.length, 2);
  assert.equal(state.efeitos.length, 1);
  assert.deepEqual([next.pv, next.pd, next.reachedZero], [10, 8, null]);
});

test('acidente e frustração tiram PV e PD sem passar de 0', () => {
  assert.equal(applyDisaster(base(), lookupDisaster(5), { amount: 3 }).pv, 7);
  assert.equal(applyDisaster(base(), lookupDisaster(6), { amount: 3 }).pd, 5);
  assert.equal(applyDisaster(base({ pv: 2 }), lookupDisaster(5), { amount: 4 }).pv, 0);
});

test('chegar a 0 só avisa (reachedZero): quem faz o teste é o jogador', () => {
  assert.equal(applyDisaster(base({ pv: 3 }), lookupDisaster(5), { amount: 3 }).reachedZero, 'pv');
  assert.equal(applyDisaster(base({ pd: 1 }), lookupDisaster(6), { amount: 2 }).reachedZero, 'pd');
  // já estava em 0 e perde mais: continua valendo o teste
  assert.equal(applyDisaster(base({ pv: 0 }), lookupDisaster(5), { amount: 1 }).reachedZero, 'pv');
  // sem perda nenhuma não há aviso, e outros recursos não contam
  assert.equal(applyDisaster(base({ pv: 0 }), lookupDisaster(5), { amount: 0 }).reachedZero, null);
  assert.equal(applyDisaster(base({ pv: 1 }), lookupDisaster(6), { amount: 2 }).reachedZero, null);
});

test('efeitos só de texto não mexem na ficha', () => {
  for (const n of [1, 7, 8]) {
    const next = applyDisaster(base(), lookupDisaster(n), { amount: 3 });
    assert.deepEqual([next.pv, next.pd, next.efeitos, next.reachedZero], [10, 8, [], null]);
  }
});

test('quando o cartão é refeito, a pendência surge, some ou fica conforme a falha crítica', () => {
  const pending = { kind: 'disaster', status: 'pending' };
  assert.equal(disasterSync(undefined, true), 'create');
  assert.equal(disasterSync(pending, true), 'keep');
  assert.equal(disasterSync(pending, false), 'remove');
  assert.equal(disasterSync(undefined, false), 'keep');
  // reservada ou já rolada: não mexe
  assert.equal(disasterSync({ kind: 'disaster', status: 'rolling' }, false), 'keep');
  assert.equal(disasterSync({ kind: 'disaster', status: 'rolled' }, false), 'keep');
  assert.equal(disasterSync({ kind: 'disaster', status: 'rolled' }, true), 'keep');
  // uma tabela de outro tipo nunca é removida por aqui
  assert.equal(disasterSync({ kind: 'lesion', status: 'pending' }, false), 'keep');
});

test('o cartão de resultado do efeito traz detalhe, aviso de zero e marca de escolha do mestre', () => {
  const ctx = buildTableResultContext({
    kind: 'disaster',
    entry: lookupDisaster(5),
    rolls: [5],
    amount: 3,
    reachedZero: 'pv',
  });
  assert.equal(ctx.titleKey, 'DESORDEM.Tabela.Titulo.disaster');
  assert.equal(ctx.rollsLabelKey, 'DESORDEM.FalhaCritica.RolagensTabela');
  assert.equal(ctx.nameKey, 'DESORDEM.FalhaCritica.acidente.Nome');
  assert.equal(ctx.detailKey, 'DESORDEM.FalhaCritica.PerdeuPV');
  assert.equal(ctx.zeroKey, 'DESORDEM.FalhaCritica.AvisoLesao');
  assert.equal(ctx.testNumber, null);

  const pd = buildTableResultContext({
    kind: 'disaster',
    entry: lookupDisaster(6),
    amount: 2,
    reachedZero: 'pd',
    manual: true,
  });
  assert.equal(pd.detailKey, 'DESORDEM.FalhaCritica.PerdeuPD');
  assert.equal(pd.zeroKey, 'DESORDEM.FalhaCritica.AvisoTrauma');
  assert.deepEqual([pd.manual, pd.hasRolls], [true, false]);

  const texto = buildTableResultContext({ kind: 'disaster', entry: lookupDisaster(1) });
  assert.deepEqual([texto.detailKey, texto.zeroKey], [null, null]);
});
