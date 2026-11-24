/**
 * Módulos comuns da v0.28.2 (`scripts/shared/` e o básico do chat): tradução, redesenho das
 * fichas, roteador do socket, publicação de mensagens e avisos de habilidade.
 */
import { log, makeUser, resetFoundry } from './foundry-stub.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { t } from '../scripts/shared/i18n.js';
import { refreshOpenSheets } from '../scripts/shared/sheets.js';
import { SOCKET, isActiveGM, onSocketAction } from '../scripts/shared/socket.js';
import { postMessage } from '../scripts/rolls/chat-post.js';
import { abilityNote, markCompanionHurt, skillName } from '../scripts/rolls/ability-notes.js';
import * as chat from '../scripts/rolls/chat.js';
import * as abilitiesChat from '../scripts/rolls/abilities-chat.js';

test('t traduz e, com dados, troca os marcadores', () => {
  resetFoundry();
  assert.equal(t('DESORDEM.X'), 'DESORDEM.X');
  assert.equal(t('DESORDEM.X', { n: 2 }), 'DESORDEM.X{"n":2}');
});

test('refreshOpenSheets redesenha só as partes pedidas, só nas janelas abertas que as têm', () => {
  const renders = [];
  const sheet = (name, parts, rendered = true) => ({
    rendered,
    constructor: { PARTS: parts },
    render: (options) => renders.push([name, options]),
  });
  const instances = foundry.applications.instances;
  instances.clear();
  instances.set('a', sheet('ficha', { furtividade: {}, condicao: {} }));
  instances.set('b', sheet('fechada', { furtividade: {} }, false));
  instances.set('c', sheet('criatura', { ficha: {} }));
  instances.set('d', { rendered: true, constructor: {}, render: () => renders.push(['outra']) });
  refreshOpenSheets(['furtividade', 'condicao']);
  assert.deepEqual(renders, [['ficha', { parts: ['furtividade', 'condicao'] }]]);
  instances.clear();
});

test('socket: o canal é o do sistema e só o mestre ativo atende', () => {
  assert.equal(SOCKET, 'system.desordem-normal');
  const gm = makeUser('gm', { isGM: true });
  resetFoundry({ user: gm });
  assert.equal(isActiveGM(), true);
  resetFoundry({ user: makeUser('p'), activeGM: gm });
  assert.equal(isActiveGM(), false);
  resetFoundry({ user: gm, activeGM: null });
  assert.equal(isActiveGM(), false);
});

test('socket: registrar a mesma ação duas vezes avisa no console (a última vale)', () => {
  const warnings = [];
  const original = console.warn;
  console.warn = (text) => warnings.push(text);
  try {
    onSocketAction('testeRepetido', () => 1);
    onSocketAction('testeRepetido', () => 2);
  } finally {
    console.warn = original;
  }
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /testeRepetido/);
});

test('postMessage monta a mensagem com o falante, as flags do sistema e o modo de rolagem', async () => {
  resetFoundry();
  game.settings.values.set('core.rollMode', 'publicroll');
  const modes = [];
  ChatMessage.applyRollMode = (data, mode) => modes.push(mode);
  const sent = await postMessage({ actor: {}, content: '<p>oi</p>', flags: { teste: 1 } });
  assert.deepEqual(sent.flags, { 'desordem-normal': { teste: 1 } });
  assert.equal(sent.sound, undefined);
  await postMessage({ actor: {}, content: '', rolls: [{}], rollMode: 'selfroll' });
  assert.deepEqual(modes, ['publicroll', 'selfroll']);
});

test('chat.js e abilities-chat.js continuam exportando o que saiu deles', () => {
  assert.equal(chat.postMessage, postMessage);
  assert.equal(typeof chat.render, 'function');
  assert.equal(abilitiesChat.abilityNote, abilityNote);
  assert.equal(abilitiesChat.markCompanionHurt, markCompanionHurt);
  assert.equal(abilitiesChat.skillName, skillName);
});

test('skillName: perícia, área de Aptidão e chave desconhecida', () => {
  resetFoundry();
  assert.equal(skillName('luta'), 'DESORDEM.Pericias.luta');
  assert.equal(skillName('artes'), 'DESORDEM.Ficha.Aptidoes: DESORDEM.Aptidoes.artes');
  assert.equal(skillName('xyz'), 'xyz');
});

test('abilityNote usa o nome do personagem quando não há título nem efeito', async () => {
  resetFoundry();
  const note = await abilityNote({ name: 'Ana' }, { text: 'usou' });
  assert.match(note.content, /"title":"Ana"/);
  assert.match(note.content, /"text":"usou"/);
});

test('markCompanionHurt marca o animal ferido uma vez e avisa no chat', async () => {
  resetFoundry();
  const updates = [];
  const actor = {
    name: 'Ana',
    system: { cena: { animalFerido: false } },
    items: [],
    effects: [],
    async update(changes) {
      updates.push(changes);
      actor.system.cena.animalFerido = true;
    },
  };
  const created = [];
  ChatMessage.create = async (data) => created.push(data);
  await markCompanionHurt(actor);
  await markCompanionHurt(actor);
  assert.deepEqual(updates, [{ 'system.cena.animalFerido': true }]);
  assert.equal(created.length, 1);
  assert.match(created[0].content, /DESORDEM\.Habilidade\.AnimalFerido/);
  assert.deepEqual(log.errors, []);
});

test('hasActiveGM: com mestre conectado segue; sem mestre avisa (chave padrão ou a pedida)', async () => {
  const { hasActiveGM } = await import('../scripts/shared/socket.js');
  const player = makeUser('p');
  resetFoundry({ user: player, activeGM: makeUser('gm', { isGM: true }) });
  assert.equal(hasActiveGM(), true);
  assert.deepEqual(log.warnings, []);
  resetFoundry({ user: player, activeGM: null });
  assert.equal(hasActiveGM(), false);
  assert.equal(hasActiveGM('DESORDEM.Socorro.SemMestre'), false);
  assert.deepEqual(log.warnings, ['DESORDEM.SemMestre', 'DESORDEM.Socorro.SemMestre']);
});

test('canWriteOrAsk: quem grava a mensagem não precisa de mestre; quem não grava, precisa', async () => {
  const { canWriteOrAsk } = await import('../scripts/shared/socket.js');
  const { makeMessage } = await import('./foundry-stub.js');
  resetFoundry({ user: makeUser('p'), activeGM: null });
  assert.equal(canWriteOrAsk(makeMessage('a', {}, { canModify: true })), true);
  assert.deepEqual(log.warnings, []);
  assert.equal(canWriteOrAsk(makeMessage('b')), false);
  assert.deepEqual(log.warnings, ['DESORDEM.SemMestre']);
  resetFoundry({ user: makeUser('p'), activeGM: makeUser('gm', { isGM: true }) });
  assert.equal(canWriteOrAsk(makeMessage('c')), true);
});
