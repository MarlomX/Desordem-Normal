// Dado de pavor no Dice So Nice (v0.25.2): estilo padrão, aura e onde aplicá-los.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_FEAR_STYLE,
  FEAR_AURA_SFX,
  FEAR_COLORSET,
  FEAR_DICE_SYSTEM,
  FEAR_EMISSIVE,
  decorateFearRolls,
  fearAppearance,
  fearAuraSfx,
  faceLabels,
  fearColorsetData,
  fearDicePresets,
  fearRollIndexes,
  loadDicePresets,
  presetsNeedingLoad,
  wantsAura,
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
  assert.deepEqual(fearAppearance(), {
    colorset: FEAR_COLORSET,
    ...DEFAULT_FEAR_STYLE,
    system: FEAR_DICE_SYSTEM,
  });
  // O jogador não troca o sistema de dados do pavor (é ele que dá o brilho aos números)
  assert.equal(fearAppearance({ system: 'outro' }).system, FEAR_DICE_SYSTEM);
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

test('sistema do pavor: rótulos padrão (d10 com 0) e brilho em todos os dados', () => {
  assert.deepEqual(faceLabels(4), ['1', '2', '3', '4']);
  assert.equal(faceLabels(10)[9], '0');
  assert.equal(faceLabels(20).length, 20);
  const presets = fearDicePresets();
  assert.deepEqual(
    presets.map((preset) => preset.type),
    ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'],
  );
  for (const preset of presets) {
    assert.equal(preset.system, FEAR_DICE_SYSTEM);
    assert.equal(preset.emissive, FEAR_EMISSIVE.color);
    assert.equal(preset.labels.length, Number(preset.type.slice(1)));
  }
});

test('wantsAura: só dados marcados com a aura e que não são fantasmas', () => {
  assert.equal(wantsAura({ sfx: fearAuraSfx() }), true);
  assert.equal(wantsAura({ sfx: fearAuraSfx(), ghost: true }), false);
  assert.equal(wantsAura({ sfx: { specialEffect: 'PlayAnimationOutline' } }), false);
  assert.equal(wantsAura({}), false);
  assert.equal(wantsAura(undefined), false);
});

/**
 * Preset de mentira (v0.26.0): imita o `DicePreset` do Dice So Nice, com `modelLoaded` e um
 * `loadTextures` que marca o preset como carregado (ou falha, se `fails`).
 */
const fakePreset = (type, { loaded = false, fails = false, noLoader = false } = {}) => {
  const preset = { type, modelLoaded: loaded, calls: 0 };
  if (!noLoader) {
    preset.loadTextures = async () => {
      preset.calls += 1;
      if (fails) throw new Error('falhou');
      preset.modelLoaded = true;
    };
  }
  return preset;
};

test('presetsNeedingLoad: só os registrados e não carregados', () => {
  const pending = fakePreset('d6');
  const done = fakePreset('d8', { loaded: true });
  const unknown = { type: 'd10' }; // outra versão do Dice So Nice, sem o campo: não mexe
  assert.deepEqual(presetsNeedingLoad([pending, done, unknown, null]), [pending]);
  assert.deepEqual(presetsNeedingLoad(new Map([['d6', pending]]).values()), [pending]);
});

test('loadDicePresets: carrega os pendentes e separa os que falham', async () => {
  const ok = fakePreset('d6');
  const done = fakePreset('d8', { loaded: true });
  const broken = fakePreset('d12', { fails: true });
  const noLoader = fakePreset('d20', { noLoader: true });
  const { loaded, failed } = await loadDicePresets([ok, done, broken, noLoader]);
  assert.deepEqual(loaded, [ok]);
  assert.deepEqual(failed, [broken, noLoader]);
  assert.equal(ok.modelLoaded, true);
  assert.equal(done.calls, 0);
  assert.deepEqual(await loadDicePresets([]), { loaded: [], failed: [] });
});
