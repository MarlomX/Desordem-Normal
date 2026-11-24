/**
 * Tabelas das criaturas guardadas na configuração do mundo (v0.28.3, correção B1): as edições
 * passam pela fila da store comum, então duas seguidas não se apagam.
 */
import { makeUser, resetFoundry } from './foundry-stub.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mutateTables,
  onTablesChange,
  readTables,
  registerCreatureTables,
} from '../scripts/stealth/tables.js';
import { newRow, newTable, updateRow } from '../scripts/rolls/creature-table.js';

function setup(user = makeUser('gm', { isGM: true })) {
  resetFoundry({ user });
  registerCreatureTables();
}

test('sem nada gravado, não há tabelas', () => {
  setup();
  assert.deepEqual(readTables(), { tabelas: [] });
});

test('editar um campo e adicionar uma linha logo em seguida guarda as duas coisas', async () => {
  setup();
  await mutateTables(() => ({ tabelas: [newTable('t1', 'Cultista')] }));
  const rowId = (table) => table.linhas[0].id;
  await mutateTables((data) => ({
    tabelas: [{ ...data.tabelas[0], linhas: [newRow('r1', data.tabelas[0])] }],
  }));
  // As duas mudanças saem juntas, como o «blur» do campo e o clique em «adicionar linha»
  const edit = mutateTables((data) => ({
    tabelas: [updateRow(data.tabelas[0], rowId(data.tabelas[0]), 'texto', 'Ataca')],
  }));
  const add = mutateTables((data) => ({
    tabelas: [
      { ...data.tabelas[0], linhas: [...data.tabelas[0].linhas, newRow('r2', data.tabelas[0])] },
    ],
  }));
  await Promise.all([edit, add]);
  const [table] = readTables().tabelas;
  assert.equal(table.linhas.length, 2);
  assert.equal(table.linhas[0].texto, 'Ataca');
});

test('jogador não grava tabelas', async () => {
  setup(makeUser('player'));
  await mutateTables(() => ({ tabelas: [newTable('t1', 'X')] }));
  assert.deepEqual(readTables(), { tabelas: [] });
});

test('quem ouve (a janela de procura) é avisado quando as tabelas mudam', async () => {
  setup();
  let calls = 0;
  const stop = onTablesChange(() => calls++);
  await mutateTables(() => ({ tabelas: [newTable('t1', 'X')] }));
  stop();
  await mutateTables(() => ({ tabelas: [] }));
  assert.equal(calls, 1);
});
