/**
 * v0.21.4 — janela Resolver dano: armadura, redução do escudo (só no teste oposto) e quem recebe
 * um dano aplicado sem alvo mirado.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  damageCandidates,
  resolveDamage,
  shieldReduction,
} from '../scripts/rolls/damage-resolve.js';
import { effectSupported } from '../scripts/rolls/ability-effects-editor.js';

test('resolveDamage sem escolhas: o dano passa inteiro', () => {
  assert.deepEqual(resolveDamage({ amount: 14 }), {
    raw: 14,
    final: 14,
    armorUsed: false,
    armorAmount: 0,
    shieldUsed: false,
    shieldAmount: 0,
  });
});

test('resolveDamage: a armadura tira 10, só se houver ponto e dano', () => {
  assert.equal(resolveDamage({ amount: 14, useArmor: true, armorAvailable: 1 }).final, 4);
  assert.equal(resolveDamage({ amount: 6, useArmor: true, armorAvailable: 1 }).armorAmount, 6);
  assert.equal(resolveDamage({ amount: 14, useArmor: true, armorAvailable: 0 }).armorUsed, false);
  assert.equal(resolveDamage({ amount: 0, useArmor: true, armorAvailable: 2 }).armorUsed, false);
});

test('resolveDamage: armadura primeiro, depois o escudo; nunca abaixo de 0', () => {
  const shield = { applies: true, reduction: 3 };
  const both = resolveDamage({
    amount: 15,
    useArmor: true,
    armorAvailable: 1,
    useShield: true,
    shield,
  });
  assert.deepEqual([both.final, both.armorAmount, both.shieldAmount], [2, 10, 3]);
  const small = resolveDamage({
    amount: 12,
    useArmor: true,
    armorAvailable: 1,
    useShield: true,
    shield,
  });
  assert.deepEqual([small.final, small.shieldAmount], [0, 2]);
  // Escudo que não vale (soma abaixo do mínimo) não reduz, mesmo marcado
  const off = resolveDamage({
    amount: 8,
    useShield: true,
    shield: { applies: false, reduction: 3 },
  });
  assert.equal(off.final, 8);
  assert.equal(off.shieldUsed, false);
});

test('shieldReduction: vale com a soma no mínimo; precisa do efeito e dos números', () => {
  assert.deepEqual(shieldReduction({ somaMinima: 7 }, { total: 9, lowRoll: 3 }), {
    applies: true,
    reduction: 3,
    minimum: 7,
    total: 9,
  });
  assert.equal(shieldReduction({ somaMinima: 7 }, { total: 6, lowRoll: 2 }).applies, false);
  assert.equal(shieldReduction(null, { total: 9, lowRoll: 3 }), null);
  assert.equal(shieldReduction({ somaMinima: 7 }, null), null);
  // Cartão antigo, sem a rolagem baixa guardada
  assert.equal(shieldReduction({ somaMinima: 7 }, { total: 9 }), null);
  assert.equal(effectSupported({ tipo: 'reducaoEscudo', params: {} }, 'escudo'), true);
});

test('damageCandidates: jogador com uma ficha recebe direto; com várias, lista', () => {
  const actors = [
    { id: '1', name: 'Rowan', type: 'personagem', isOwner: true },
    { id: '2', name: 'Anna', type: 'personagem', isOwner: false },
    { id: '3', name: 'Lobo', type: 'criatura', isOwner: true },
  ];
  const player = damageCandidates(actors, { isGM: false });
  assert.deepEqual(
    player.candidates.map((a) => a.id),
    ['1'],
  );
  assert.equal(player.direct.id, '1');
  const two = damageCandidates(
    [...actors, { id: '4', name: 'Bran', type: 'personagem', isOwner: true }],
    {
      isGM: false,
    },
  );
  assert.equal(two.direct, null);
  assert.deepEqual(
    two.candidates.map((a) => a.name),
    ['Bran', 'Rowan'],
  );
});

test('damageCandidates: o mestre sempre escolhe na lista de todos os personagens', () => {
  const actors = [
    { id: '1', name: 'Rowan', type: 'personagem', isOwner: true },
    { id: '3', name: 'Lobo', type: 'criatura', isOwner: true },
  ];
  const gm = damageCandidates(actors, { isGM: true });
  assert.equal(gm.direct, null);
  assert.deepEqual(
    gm.candidates.map((a) => a.id),
    ['1'],
  );
  assert.deepEqual(damageCandidates([], { isGM: false }), { candidates: [], direct: null });
});
