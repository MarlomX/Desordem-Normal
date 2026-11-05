import { SYSTEM_ID, ATRIBUTOS, PERICIAS, APTIDOES } from './config.js';
import PersonagemModel from './data/personagem.js';

Hooks.once('init', () => {
  console.log(`${SYSTEM_ID} | inicializando o sistema`);

  CONFIG.DESORDEM = { ATRIBUTOS, PERICIAS, APTIDOES };
  CONFIG.Actor.dataModels.personagem = PersonagemModel;
});

Hooks.once('ready', () => {
  console.log(`${SYSTEM_ID} | pronto`);
});
