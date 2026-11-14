import test from 'node:test';
import assert from 'node:assert/strict';
import { activeBoosts } from '../scripts/rolls/abilities.js';
import {
  resolveNonLethal,
  lesionRollCount,
  NON_LETHAL_BONUS_DIE,
} from '../scripts/rolls/injury.js';
import {
  buildRollModel,
  emptySelection,
  evaluateSelection,
  selectionToOptions,
} from '../scripts/rolls/roll-dialog.js';

const context = { skillKey: 'vigor', impeto: 0, pd: 0 };

test('activeBoosts: dano não letal dá +d6 sem custo, mas só quando o teste o permite', () => {
  assert.deepEqual(activeBoosts(['naoLetal'], { ...context, allowNonLethal: true }), {
    extraDice: [NON_LETHAL_BONUS_DIE],
    pdCost: 0,
    impetoCost: 0,
    used: ['naoLetal'],
  });
  assert.deepEqual(activeBoosts(['naoLetal'], context).extraDice, []);
  assert.deepEqual(activeBoosts([], { ...context, allowNonLethal: true }).extraDice, []);
});

test('activeBoosts: o dano não letal soma ao dado de ímpeto', () => {
  const boosts = activeBoosts(['impetoDado', 'naoLetal'], {
    ...context,
    impeto: 2,
    allowNonLethal: true,
  });
  assert.deepEqual(boosts.extraDice, [4, 6]);
  assert.equal(boosts.impetoCost, 1);
  assert.equal(boosts.pdCost, 0);
});

test('resolveNonLethal: a habilidade marcada na janela vale para a tabela (2d20)', () => {
  const r = resolveNonLethal(false, ['impetoDado', 'naoLetal']);
  assert.equal(r.nonLethal, true);
  assert.deepEqual(r.active, ['impetoDado', 'naoLetal']);
  assert.equal(lesionRollCount(r.nonLethal), 2);
});

test('resolveNonLethal: com o marcador direto o d6 não entra duas vezes', () => {
  const r = resolveNonLethal(true, ['naoLetal', 'impetoDado']);
  assert.equal(r.nonLethal, true);
  assert.deepEqual(r.active, ['impetoDado']);
});

test('resolveNonLethal: sem marcador nem habilidade o dano é letal', () => {
  assert.deepEqual(resolveNonLethal(false, ['impetoDado']), {
    nonLethal: false,
    active: ['impetoDado'],
  });
  assert.deepEqual(resolveNonLethal(), { nonLethal: false, active: [] });
});

const base = (has) =>
  buildRollModel({
    skillKey: 'vigor',
    attrDie: 8,
    skillDie: 6,
    has,
    resources: { impeto: 0, pd: 0 },
    ignoreFear: true,
  });

test('janela do teste: "naoLetal" só aparece quando oferecido (teste de lesão)', () => {
  assert.deepEqual(base({}).abilities, []);
  const [ability] = base({ naoLetal: true }).abilities;
  assert.deepEqual(ability, {
    key: 'naoLetal',
    die: 6,
    cost: { impeto: 0, pd: 0 },
    available: true,
    reason: null,
  });
});

test('janela do teste: marcar o dano não letal ocupa um espaço e envia a habilidade', () => {
  const model = base({ naoLetal: true });
  const selection = { ...emptySelection(7), active: ['naoLetal'] };
  const evaluated = evaluateSelection(model, selection);
  assert.deepEqual(
    evaluated.slots.filter((s) => s.locked).map((s) => [s.kind, s.sides]),
    [['naoLetal', 6]],
  );
  assert.equal(evaluated.valid, true);
  assert.deepEqual(selectionToOptions(model, selection).active, ['naoLetal']);
  assert.equal(evaluated.pdCost, 0);
  assert.equal(evaluated.impetoCost, 0);
});
