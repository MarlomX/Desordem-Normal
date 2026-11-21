/**
 * v0.21.8 — munição (efeito `municao`, ex.: aljava) e dado bônus ao usar (efeito `concederDado`,
 * ex.: crucifixo).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ammoEffectOf,
  ammoOptions,
  itemEffectTypes,
  itemUsePlan,
  normalizeEffects,
} from '../scripts/rolls/ability-effects.js';
import { describeEffect, effectSupported } from '../scripts/rolls/ability-effects-editor.js';
import { itemUseChanges } from '../scripts/rolls/equipment.js';

const t = (key, data) => (data ? `${key}:${JSON.stringify(data)}` : key);
const ammoEffect = (params = {}) => ({
  id: 'm',
  tipo: 'municao',
  params: { alcance: 'distancia', passos: 1, dano: 1, ...params },
});
const quiver = (extra = {}, efeitos = [ammoEffect()]) => ({
  id: 'aljava',
  name: 'Aljava',
  type: 'item',
  system: { consumivel: true, quantidade: 6, usosMax: 0, usos: 0, efeitos, ...extra },
});
const bow = { tipo: 'distancia' };
const sword = { tipo: 'corpo' };

test('ammoOptions: vale nas armas à distância, com unidades sobrando', () => {
  assert.deepEqual(ammoOptions([quiver()], bow), [
    { id: 'aljava', name: 'Aljava', passos: 1, dano: 1, remaining: 6 },
  ]);
  assert.deepEqual(ammoOptions([quiver()], sword), []);
  assert.deepEqual(ammoOptions([quiver({ quantidade: 0 })], bow), []);
  // Não consumível: vale sempre, sem contagem
  assert.equal(ammoOptions([quiver({ consumivel: false })], bow)[0].remaining, null);
  // Item sem o efeito, ou arma (não item geral), não é munição
  assert.deepEqual(ammoOptions([quiver({}, [])], bow), []);
  assert.deepEqual(ammoOptions([{ ...quiver(), type: 'arma' }], bow), []);
});

test('ammoEffectOf lê o efeito sem olhar as unidades (o cartão oposto soma o dano depois)', () => {
  assert.deepEqual(ammoEffectOf(quiver({ quantidade: 0 }), bow), {
    alcance: 'distancia',
    passos: 1,
    dano: 1,
  });
  assert.equal(ammoEffectOf(quiver(), sword), null);
});

test('munição consumível gasta uma unidade por ataque (como um uso)', () => {
  assert.deepEqual(itemUseChanges(quiver().system), { 'system.quantidade': 5 });
  assert.equal(itemUseChanges(quiver({ quantidade: 0 }).system), null);
});

test('concederDado entra no plano de uso como dado da reserva', () => {
  const effects = normalizeEffects([{ id: 'c', tipo: 'concederDado', params: { dado: 10 } }]);
  const plan = itemUsePlan(effects);
  assert.deepEqual(plan.dice, [10]);
  assert.equal(plan.hasUse, true);
  // A munição é passiva: não liga o botão Usar
  assert.equal(itemUsePlan(normalizeEffects([ammoEffect()])).hasUse, false);
});

test('os dois efeitos são só do item geral e têm resumo', () => {
  for (const tipo of ['concederDado', 'municao']) {
    assert.ok(itemEffectTypes('item').includes(tipo), tipo);
    assert.equal(itemEffectTypes('habilidade').includes(tipo), false, tipo);
    assert.equal(itemEffectTypes('arma').includes(tipo), false, tipo);
    assert.equal(effectSupported({ tipo, params: {} }, 'item'), true, tipo);
  }
  const [die, ammo] = normalizeEffects([
    { id: 'c', tipo: 'concederDado', params: { dado: 10 } },
    ammoEffect({ passos: 1, dano: 2 }),
  ]);
  assert.ok(describeEffect(die, { t, skill: (k) => k }).includes('"dado":10'));
  const text = describeEffect(ammo, { t, skill: (k) => k });
  assert.ok(text.includes('"passos":1') && text.includes('"dano":2'));
});

test('diceVariantKey separa munição e a caixa «contra quem ainda não me atacou»', async () => {
  const { diceVariantKey } = await import('../scripts/rolls/roll-dialog.js');
  assert.equal(diceVariantKey(null, false), '|0');
  assert.equal(diceVariantKey('aljava', false), 'aljava|0');
  assert.equal(diceVariantKey('aljava', true), 'aljava|1');
  assert.notEqual(diceVariantKey(null, true), diceVariantKey(null, false));
});
