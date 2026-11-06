import { SYSTEM_ID, ATRIBUTOS, PERICIAS, APTIDOES } from './config.js';
import PersonagemModel from './data/personagem.js';
import PersonagemSheet from './sheets/personagem-sheet.js';
import { rollTest, rollSkill } from './rolls/chat.js';

Hooks.once('init', () => {
  console.log(`${SYSTEM_ID} | inicializando o sistema`);

  CONFIG.DESORDEM = { ATRIBUTOS, PERICIAS, APTIDOES };
  CONFIG.Actor.dataModels.personagem = PersonagemModel;

  foundry.documents.collections.Actors.registerSheet(SYSTEM_ID, PersonagemSheet, {
    types: ['personagem'],
    makeDefault: true,
    label: 'DESORDEM.Ficha.Personagem',
  });

  // API para macros e para teste pelo console
  game.desordem = { rollTest, rollSkill };
});

Hooks.once('ready', () => {
  console.log(`${SYSTEM_ID} | pronto`);
});