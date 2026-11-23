// Dado de pavor no Dice So Nice (v0.25.2): estilo padrão, aura e onde aplicá-los.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_FEAR_STYLE,
  FEAR_AURA_SFX,
  FEAR_COLORSET,
  decorateFearRolls,
  fearAppearance,
  fearAuraSfx,
  fearColorsetData,
  fearRollIndexes,
} from '../scripts/dice3d/fear-dice.js';

/** Roll de mentira: só o que o Dice So Nice lê (o primeiro termo de dado e as opções). */
const fakeRoll = () => ({ dice: [{ options: {} }] });

test('fearColorsetData: o conjunto do pavor, escondido da lista de cores', () => {
  const data = fearColorsetData((key) => `t:${key}`);
  assert.equal(data.name, FEAR_COLORSET);
  assert.equal(data.visibility, 'hidden');
  assert.equal(data.background, '#0c0d0f');
  assert.equal(data.edge, '#9fd6ee');
  assert.equal(data.description, 't:DESORDEM.Dados3D.Conjunto');
});

test('fearAppearance: padrão do sistema, com campos trocáveis', () => {
  assert.deepEqual(fearAppearance(), { colorset: FEAR_COLORSET, ...DEFAULT_FEAR_STYLE });
  const custom = fearAppearance({ background: '#330000' });
  assert.equal(custom.background, '#330000');
  assert.equal(custom.foreground, DEFAULT_FEAR_STYLE.foreground);
});

test('fearRollIndexes: pavor é o último Roll; abraçado conta a partir dos dois dados base', () => {
  assert.deepEqual(fearRollIndexes({ rolledCount: 2, hasFear: true }), {
    fear: 2,
    embraced: null,
  });
  assert.deepEqual(fearRollIndexes({ rolledCount: 2, hasFear: false }), {
    fear: null,
    embraced: null,
  });
  // Abraçado como único extra: terceiro dado
  assert.deepEqual(fearRollIndexes({ rolledCount: 3, hasFear: false, embracedExtraIndex: 0 }), {
    fear: null,
    embraced: 2,
  });
  // Abraçado depois de um dado bônus
  assert.deepEqual(fearRollIndexes({ rolledCount: 4, hasFear: false, embracedExtraIndex: 1 }), {
    fear: null,
    embraced: 3,
  });
  // Passou do limite de 4 dados: foi descartado, nada a marcar
  assert.deepEqual(fearRollIndexes({ rolledCount: 4, hasFear: false, embracedExtraIndex: 2 }), {
    fear: null,
    embraced: null,
  });
});

test('decorateFearRolls: aparência e aura só no pavor; só aura no abraçado', () => {
  const rolls = [fakeRoll(), fakeRoll(), fakeRoll()];
  assert.equal(decorateFearRolls(rolls, { fear: 2, embraced: null }), 1);
  assert.deepEqual(rolls[0].dice[0].options, {});
  assert.deepEqual(rolls[1].dice[0].options, {});
  assert.equal(rolls[2].dice[0].options.appearance.colorset, FEAR_COLORSET);
  assert.deepEqual(rolls[2].dice[0].options.sfx, { specialEffect: FEAR_AURA_SFX, options: {} });

  const embraced = [fakeRoll(), fakeRoll(), fakeRoll()];
  assert.equal(decorateFearRolls(embraced, { fear: null, embraced: 2 }), 1);
  assert.equal(embraced[2].dice[0].options.appearance, undefined);
  assert.deepEqual(embraced[2].dice[0].options.sfx, fearAuraSfx());
});

test('decorateFearRolls: aparência copiada (cada dado com o seu objeto) e índice inválido', () => {
  const style = fearAppearance();
  const rolls = [fakeRoll(), fakeRoll(), fakeRoll()];
  decorateFearRolls(rolls, { fear: 2, embraced: null }, style);
  assert.notEqual(rolls[2].dice[0].options.appearance, style);
  assert.equal(decorateFearRolls(rolls, { fear: 9, embraced: null }), 0);
  assert.equal(decorateFearRolls([{ dice: [] }], { fear: 0, embraced: null }), 0);
});
