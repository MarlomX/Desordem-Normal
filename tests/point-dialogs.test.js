/**
 * Janelas da folha do ponto de interesse (`journal/point-dialogs.js`, v0.28.8).
 */
import { log, makeUser, resetFoundry } from './foundry-stub.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  askReceivingActor,
  askRevealUsers,
  canSeePage,
  pointPlayers,
} from '../scripts/journal/point-dialogs.js';

/** Página de mentira: só quem está em `seeing` pode ver. */
const pageFor = (seeing) => ({ testUserPermission: (user) => seeing.includes(user.id) });

function setupUsers() {
  resetFoundry();
  const players = [makeUser('ana'), makeUser('bia')];
  for (const user of players) game.users.add(user);
  return players;
}

test('pointPlayers lista só quem não é mestre; canSeePage pergunta à página', () => {
  setupUsers();
  assert.deepEqual(
    pointPlayers().map((user) => user.id),
    ['ana', 'bia'],
  );
  const page = pageFor(['ana']);
  assert.equal(canSeePage(page, { id: 'ana' }), true);
  assert.equal(canSeePage(page, { id: 'bia' }), false);
});

test('askRevealUsers: sem jogadores avisa; cancelar devolve null', async () => {
  resetFoundry();
  assert.equal(await askRevealUsers(pageFor([]), []), null);
  assert.deepEqual(log.infos, ['DESORDEM.Ponto.Jogadores.Nenhum']);
  setupUsers();
  foundry.applications.api.DialogV2.answer = null;
  assert.equal(await askRevealUsers(pageFor([]), []), null);
});

test('askRevealUsers só aceita jogadores da lista e avisa de quem não vê a página', async () => {
  setupUsers();
  const { DialogV2 } = foundry.applications.api;
  DialogV2.answer = { confirmed: true, ids: ['ana', 'bia', 'intruso'] };
  const chosen = await askRevealUsers(pageFor(['ana']), ['ana']);
  assert.deepEqual(
    chosen.map((user) => user.id),
    ['ana', 'bia'],
  );
  assert.equal(log.warnings.length, 1);
  assert.match(log.warnings[0], /DESORDEM\.Ponto\.AvisoSemAcesso.*bia/);
});

test('askReceivingActor: sem personagens avisa; escolha devolve o personagem', async () => {
  resetFoundry();
  assert.equal(await askReceivingActor('Faca'), null);
  assert.deepEqual(log.warnings, ['DESORDEM.Ponto.Vinculo.SemPersonagens']);
  resetFoundry();
  const ana = { id: 'a1', name: 'Ana', type: 'personagem', hasPlayerOwner: true };
  game.actors.add(ana);
  game.actors.add({ id: 'c1', name: 'Cão', type: 'criatura', hasPlayerOwner: false });
  const { DialogV2 } = foundry.applications.api;
  DialogV2.answer = { confirmed: true, id: 'a1' };
  assert.equal(await askReceivingActor('Faca'), ana);
  DialogV2.answer = { confirmed: true, id: 'c1' };
  assert.equal(await askReceivingActor('Faca'), null);
});
