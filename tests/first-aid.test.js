import test from 'node:test';
import assert from 'node:assert/strict';
import {
  firstAidDt,
  firstAidOutcome,
  firstAidStepMods,
  hasMedicalKit,
} from '../scripts/rolls/first-aid.js';
import { computeDamage, damageBaseValue } from '../scripts/rolls/damage.js';
import { needsUnarmed, unarmedWeaponData, weaponDamageLabel } from '../scripts/rolls/equipment.js';
import { activeBoosts } from '../scripts/rolls/abilities.js';
import { buildRollModel, evaluateSelection, emptySelection } from '../scripts/rolls/roll-dialog.js';

test('firstAidDt: 7, depois +3 a cada uso no mesmo paciente', () => {
  assert.equal(firstAidDt(0), 7);
  assert.equal(firstAidDt(1), 10);
  assert.equal(firstAidDt(2), 13);
  assert.equal(firstAidDt(undefined), 7);
  assert.equal(firstAidDt(-1), 7);
});

test('firstAidStepMods: −2 sem maleta, −2 em si mesmo, sempre no maior dado (até 2d4)', () => {
  assert.deepEqual(firstAidStepMods({ kit: true, self: false }, 8, 6), []);
  // Mente d8, Medicina d6: d8→d6 (empate fica no atributo) e d6→d4
  assert.deepEqual(firstAidStepMods({ kit: false, self: false }, 8, 6), [
    { target: 'attribute', steps: -2 },
  ]);
  assert.deepEqual(firstAidStepMods({ kit: true, self: true }, 6, 10), [
    { target: 'skill', steps: -2 },
  ]);
  // Quatro reduções em d6 + d6: chega a d4 + d4 e para (não passa de 2d4)
  assert.deepEqual(firstAidStepMods({ kit: false, self: true }, 6, 6), [
    { target: 'attribute', steps: -1 },
    { target: 'skill', steps: -1 },
  ]);
  assert.deepEqual(firstAidStepMods({ kit: false, self: true }, 4, 4), []);
});

test('hasMedicalKit reconhece a maleta pelo nome, sem acento nem caixa', () => {
  assert.equal(hasMedicalKit([{ name: 'Maleta de Medicamentos' }]), true);
  assert.equal(hasMedicalKit([{ name: 'Kit Médico' }]), true);
  assert.equal(hasMedicalKit([{ name: 'Espada' }]), false);
  assert.equal(hasMedicalKit(undefined), false);
});

test('firstAidOutcome: moribundo perde a condição, recupera 1 PV e acorda', () => {
  const out = firstAidOutcome({
    pv: { value: 0, max: 10 },
    estado: { moribundo: true, inconsciente: true },
  });
  assert.equal(out.ok, true);
  assert.equal(out.woke, true);
  assert.deepEqual(out.updates, {
    'system.pv.value': 1,
    'system.estado.moribundo': false,
    'system.estado.inconsciente': false,
  });
  // PV não passa do máximo; quem não está moribundo não recebe nada
  assert.equal(firstAidOutcome({ pv: { value: 3, max: 3 }, estado: { moribundo: true } }).after, 3);
  assert.deepEqual(firstAidOutcome({ pv: { value: 0, max: 3 }, estado: { moribundo: false } }), {
    ok: false,
  });
});

test('dano RB: rolagem baixa; no crítico soma também a rolagem alta', () => {
  const normal = { highSum: 6, highRoll: 6, lowRoll: 2, criticalSuccess: false };
  assert.equal(damageBaseValue(normal, 'ra'), 6);
  assert.equal(damageBaseValue(normal, 'rb'), 2);
  assert.equal(computeDamage(normal, 1, 'rb'), 3);
  assert.equal(computeDamage(normal, 0), 6);
  const critico = { highSum: 12, highRoll: 6, lowRoll: 6, criticalSuccess: true };
  assert.equal(damageBaseValue(critico, 'rb'), 12);
  assert.equal(computeDamage({ ...normal, lowRoll: 1 }, -3, 'rb'), 0);
});

test('weaponDamageLabel mostra a base do dano', () => {
  assert.equal(weaponDamageLabel(0, 'rb'), 'RB');
  assert.equal(weaponDamageLabel(2, 'rb'), 'RB+2');
  assert.equal(weaponDamageLabel(-1), 'RA−1');
});

test('Desarmado: arma natural corpo a corpo, dano RB não letal, criada uma vez só', () => {
  const data = unarmedWeaponData('sys', { nome: 'Desarmado', descricao: 'soco' });
  assert.equal(data.type, 'arma');
  assert.equal(data.system.baseDano, 'rb');
  assert.equal(data.system.categoria, 'natural');
  assert.equal(data.system.naoLetal, true);
  assert.equal(data.system.tipo, 'corpo');
  assert.equal(data.flags.sys.desarmado, true);
  assert.equal(needsUnarmed([], 'sys'), true);
  assert.equal(needsUnarmed(undefined, 'sys'), true);
  assert.equal(needsUnarmed([{ name: 'Espada' }], 'sys'), true);
  assert.equal(needsUnarmed([data], 'sys'), false);
});

test('Defender-se: o +d6 vem marcado na janela e entra nos dados (desmarcado, não entra)', () => {
  const model = buildRollModel({
    skillKey: 'acrobacia',
    attrDie: 6,
    skillDie: 6,
    has: { defesa: true },
    resources: { impeto: 0, pd: 0 },
  });
  const defesa = model.abilities.find((a) => a.key === 'defesa');
  assert.deepEqual(
    { die: defesa.die, checked: defesa.checked, available: defesa.available },
    { die: 6, checked: true, available: true },
  );
  const marcado = evaluateSelection(model, { ...emptySelection(7), active: ['defesa'] });
  assert.ok(marcado.slots.some((slot) => slot.sides === 6));
  const opcoes = { pd: 0, recursos: { impeto: 0 } };
  assert.deepEqual(activeBoosts(['defesa'], { ...opcoes, allowDefense: true }).extraDice, [6]);
  assert.deepEqual(activeBoosts([], { ...opcoes, allowDefense: true }).extraDice, []);
  // Fora da defesa, a caixa não vale nada mesmo que venha marcada
  assert.deepEqual(activeBoosts(['defesa'], opcoes).extraDice, []);
  const semDefesa = buildRollModel({
    skillKey: 'luta',
    attrDie: 6,
    skillDie: 6,
    resources: { impeto: 0, pd: 0 },
  });
  assert.equal(
    semDefesa.abilities.some((a) => a.key === 'defesa'),
    false,
  );
});
