import test from 'node:test';
import assert from 'node:assert/strict';
import { canGuardWeaponCard, guardWeaponCard, guardianData } from '../scripts/rolls/guardian.js';
import { linkMigrationUpdates, shouldLinkNew } from '../scripts/data/token-link.js';
import {
  effectStepMods,
  effectView,
  newEffect,
  newStepEffect,
  updateEffect,
} from '../scripts/rolls/effects.js';
import { stepIndicator } from '../scripts/rolls/steps.js';
import { buildEffectRows } from '../scripts/sheets/context.js';

// ---------- Assumir ataque no cartão comum ----------

test('guardianData: uuid, nome e o nome da habilidade', () => {
  assert.deepEqual(guardianData({ uuid: 'Actor.r', name: 'Rowan' }, { itemName: 'Guardião' }), {
    actorUuid: 'Actor.r',
    nome: 'Rowan',
    habilidade: 'Guardião',
  });
});

test('cartão de ataque: assume uma vez, antes do dano; quem atacou não assume', () => {
  const flag = { amount: 5, naoLetal: false };
  const rowan = { actorUuid: 'Actor.r', nome: 'Rowan', habilidade: 'Guardião' };
  assert.equal(canGuardWeaponCard(flag), true);
  assert.equal(canGuardWeaponCard(null), false);
  assert.equal(canGuardWeaponCard({ ...flag, aplicado: true }), false);
  const guarded = guardWeaponCard(flag, rowan, 'Actor.x');
  assert.deepEqual(guarded, { ...flag, guardiao: rowan });
  assert.equal(canGuardWeaponCard(guarded), false);
  assert.equal(guardWeaponCard(guarded, { ...rowan, actorUuid: 'Actor.y' }), null);
  assert.equal(guardWeaponCard(flag, rowan, 'Actor.r'), null);
  assert.equal(guardWeaponCard({ ...flag, aplicado: true }, rowan), null);
  assert.equal(guardWeaponCard(flag, { ...rowan, actorUuid: '' }), null);
});

// ---------- Token vinculado ----------

test('personagem novo nasce vinculado, a não ser que a criação já diga', () => {
  assert.equal(shouldLinkNew('personagem', { name: 'Ana' }), true);
  assert.equal(shouldLinkNew('personagem', { prototypeToken: { actorLink: false } }), false);
  assert.equal(shouldLinkNew('personagem', { prototypeToken: { name: 'x' } }), true);
  assert.equal(shouldLinkNew('criatura', {}), false);
});

test('migração: só os personagens ainda sem vínculo', () => {
  assert.deepEqual(
    linkMigrationUpdates([
      { id: 'a', type: 'personagem', prototypeToken: { actorLink: false } },
      { id: 'b', type: 'personagem', prototypeToken: { actorLink: true } },
      { id: 'c', type: 'criatura', prototypeToken: { actorLink: false } },
      { id: 'd', type: 'personagem' },
    ]),
    [
      { _id: 'a', 'prototypeToken.actorLink': true },
      { _id: 'd', 'prototypeToken.actorLink': true },
    ],
  );
});

// ---------- Efeitos da aba Condição com «todos os atributos» ----------

test('efeito em todos os atributos vale para o dado de qualquer atributo', () => {
  const effects = [
    newStepEffect({ nome: 'Instinto', atributo: 'todos', passos: 1, origem: 'hab:i:e' }),
    newStepEffect({ nome: 'Caído', atributo: 'fisico', passos: -1 }),
  ];
  assert.deepEqual(effectStepMods(effects, 'mente'), [{ target: 'attribute', steps: 1 }]);
  assert.deepEqual(effectStepMods(effects, 'fisico'), [
    { target: 'attribute', steps: 1 },
    { target: 'attribute', steps: -1 },
  ]);
  assert.equal(stepIndicator({ steps: {}, effects, key: 'emocao' }).net, 1);
  assert.equal(stepIndicator({ steps: {}, effects, key: 'fisico' }).net, 0);
  assert.equal(stepIndicator({ steps: {}, effects, key: 'pericias' }).net, 0);
});

test('updateEffect aceita «todos» e não deixa mudar a origem', () => {
  const [effect] = updateEffect([newEffect()], 0, { atributo: 'todos', origem: 'hab:x:y' });
  assert.equal(effectView(effect).atributo, 'todos');
  assert.equal(effect.origem, '');
  assert.equal(effectView(updateEffect([newEffect()], 0, { atributo: 'nada' })[0]).atributo, '');
});

test('buildEffectRows: etiqueta de habilidade nos passos condicionais', () => {
  const rows = buildEffectRows(
    [
      newStepEffect({ nome: 'Instinto', atributo: 'todos', passos: 1, origem: 'hab:i:e' }),
      newStepEffect({ nome: 'Caído', atributo: 'fisico', passos: -1 }),
    ],
    { describe: (entry) => entry.params.atributo, durationLabel: (k) => k },
  );
  assert.equal(rows[0].fromAbility, true);
  assert.equal(rows[0].summary, 'todos');
  assert.equal(rows[1].fromAbility, false);
});
