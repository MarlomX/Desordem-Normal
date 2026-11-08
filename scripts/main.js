import { SYSTEM_ID, ATRIBUTOS, PERICIAS, APTIDOES } from './config.js';
import PersonagemModel from './data/personagem.js';
import { ArmaModel, ArmaduraModel, ItemModel } from './data/items.js';
import PersonagemSheet from './sheets/personagem-sheet.js';
import ItemSheet from './sheets/item-sheet.js';
import { rollTest, rollSkill, rollAptitude, rollOpposed } from './rolls/chat.js';
import { damageActor, rollInjuryTest } from './rolls/health.js';
import { attackWithWeapon, useItem, renderEquipmentCard } from './rolls/equipment-chat.js';
import { registerEquipmentGuards } from './rolls/equipment-guard.js';
import { computeDamage } from './rolls/damage.js';
import { emotionalDamage, rollTraumaTest } from './rolls/mind.js';
import {
  invokeRelation,
  renderRelationCard,
  registerRelationSocket,
} from './rolls/relation-chat.js';

Hooks.once('init', () => {
  console.log(`${SYSTEM_ID} | inicializando o sistema`);

  CONFIG.DESORDEM = { ATRIBUTOS, PERICIAS, APTIDOES };
  CONFIG.Actor.dataModels.personagem = PersonagemModel;
  CONFIG.Item.dataModels = { arma: ArmaModel, armadura: ArmaduraModel, item: ItemModel };
  registerEquipmentGuards();

  foundry.documents.collections.Actors.registerSheet(SYSTEM_ID, PersonagemSheet, {
    types: ['personagem'],
    makeDefault: true,
    label: 'DESORDEM.Ficha.Personagem',
  });
  foundry.documents.collections.Items.registerSheet(SYSTEM_ID, ItemSheet, {
    types: ['arma', 'armadura', 'item'],
    makeDefault: true,
    label: 'DESORDEM.Item.Ficha',
  });

  // API para macros e para teste pelo console
  game.desordem = {
    rollTest,
    rollSkill,
    rollAptitude,
    rollOpposed,
    damageActor,
    rollInjuryTest,
    computeDamage,
    emotionalDamage,
    rollTraumaTest,
    invokeRelation,
    attackWithWeapon,
    useItem,
  };
});

Hooks.on('renderChatMessageHTML', (message, html) => {
  renderRelationCard(message, html);
  renderEquipmentCard(message, html);
});

Hooks.once('ready', () => {
  registerRelationSocket();
  console.log(`${SYSTEM_ID} | pronto`);
});