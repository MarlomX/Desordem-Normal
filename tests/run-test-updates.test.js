/**
 * Gravações do ator num teste (`runTest`, v0.28.6). Fixam o que o teste grava no fim (PD, PV,
 * pavor, dados bônus) e quantas gravações faz: cada `actor.update` vai ao servidor, passa pelos
 * hooks e redesenha a ficha em todos os navegadores.
 */
import { resetFoundry } from './foundry-stub.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { runTest } from '../scripts/rolls/chat.js';

/** Dados rolados em ordem (o Roll de mentira devolve um valor de cada vez). */
function rollValues(values) {
  const queue = [...values];
  globalThis.Roll = class {
    constructor(formula) {
      this.formula = formula;
    }
    async evaluate() {
      this.total = queue.shift() ?? 1;
      return this;
    }
  };
}

/** Ator de mentira: aplica as gravações em `system` (caminhos com ponto) e conta. */
function makeActor(system) {
  const actor = {
    name: 'Ana',
    items: [],
    system: structuredClone(system),
    updates: [],
    async update(changes) {
      actor.updates.push(changes);
      for (const [path, value] of Object.entries(changes)) {
        const keys = path.replace(/^system\./, '').split('.');
        let node = actor.system;
        for (const key of keys.slice(0, -1)) node = node[key] ??= {};
        node[keys.at(-1)] = value;
      }
    },
  };
  return actor;
}

const base = {
  pd: { value: 10, max: 10 },
  pv: { value: 10, max: 10 },
  estado: { pavor: 6 },
  recursosHab: {},
  dadosBonus: [6, 8],
};

const options = {
  attrDie: 8,
  skillDie: 6,
  dt: 10,
  label: 'Teste',
  attrLabel: 'Físico',
  skillLabel: 'Luta',
};

test('teste completo: paga PD e PV, encerra o pavor e gasta o dado bônus', async () => {
  resetFoundry();
  // atributo, perícia, dado bônus, pavor (1 encerra o pavor guardado)
  rollValues([5, 4, 3, 1]);
  const actor = makeActor(base);
  await runTest(actor, {
    ...options,
    extraDice: [6],
    fearDie: 6,
    fearStored: true,
    pdCost: 2,
    pvCost: 1,
    bonusDiceSpent: [6],
  });
  assert.equal(actor.system.pd.value, 8);
  assert.equal(actor.system.pv.value, 9);
  assert.equal(actor.system.estado.pavor, 0);
  assert.deepEqual(actor.system.dadosBonus, [8]);
  // Uma gravação antes de rolar (PD e PV) e uma depois (pavor e dados bônus); até a v0.28.5 eram 4
  assert.equal(actor.updates.length, 2);
});

test('teste sem custo nem pavor não grava nada no ator', async () => {
  resetFoundry();
  rollValues([5, 4]);
  const actor = makeActor(base);
  await runTest(actor, options);
  assert.deepEqual(actor.updates, []);
});

test('o custo nunca deixa PD ou PV abaixo de zero', async () => {
  resetFoundry();
  rollValues([5, 4]);
  const actor = makeActor({ ...base, pd: { value: 1, max: 10 }, pv: { value: 0, max: 10 } });
  await runTest(actor, { ...options, pdCost: 3, pvCost: 2 });
  assert.equal(actor.system.pd.value, 0);
  assert.equal(actor.system.pv.value, 0);
});

test('criatura (sem recursos de habilidade): o pavor encerrado ainda é gravado', async () => {
  resetFoundry();
  rollValues([5, 4, 1]);
  const { recursosHab, ...creature } = base;
  const actor = makeActor(creature);
  await runTest(actor, { ...options, fearDie: 6, fearStored: true });
  assert.equal(actor.system.estado.pavor, 0);
  assert.equal(recursosHab && actor.system.recursosHab, undefined);
});
