import { SYSTEM_ID, ATRIBUTOS, PERICIAS, APTIDOES, OFICIOS } from './config.js';
import PersonagemModel from './data/personagem.js';
import { ArmaModel, ArmaduraModel, ItemModel, HabilidadeModel } from './data/items.js';
import PersonagemSheet from './sheets/personagem-sheet.js';
import { fearDieHelper } from './sheets/dado-pavor.js';
import ItemSheet from './sheets/item-sheet.js';
import { rollTest, rollSkill, rollAptitude, rollCraft, rollOpposed } from './rolls/chat.js';
import { damageActor, rollInjuryTest } from './rolls/health.js';
import { attackWithWeapon, useItem, renderEquipmentCard } from './rolls/equipment-chat.js';
import { registerEquipmentGuards } from './rolls/equipment-guard.js';
import {
  registerAbilitySocket,
  renderTestButtons,
  endScene,
  healAlly,
  gainAnalysisMarkers,
} from './rolls/abilities-chat.js';
import { computeDamage } from './rolls/damage.js';
import { emotionalDamage, rollTraumaTest } from './rolls/mind.js';
import { renderTableCard, registerTableSocket } from './rolls/table-chat.js';
import {
  invokeRelation,
  renderRelationCard,
  registerRelationSocket,
} from './rolls/relation-chat.js';

Hooks.once('init', () => {
  console.log(`${SYSTEM_ID} | inicializando o sistema`);

  // Helper de template: {{dadoPavor lados valor tamanho}} desenha o dado de pavor em SVG (neon).
  // SafeString diz ao Handlebars que o texto devolvido é HTML pronto e não deve ser escapado
  // (o gerador só deixa passar dígitos no número, então não há risco de injeção).
  Handlebars.registerHelper(
    'dadoPavor',
    (sides, value, size) => new Handlebars.SafeString(fearDieHelper(sides, value, size)),
  );

  CONFIG.DESORDEM = { ATRIBUTOS, PERICIAS, APTIDOES, OFICIOS };
  CONFIG.Actor.dataModels.personagem = PersonagemModel;
  CONFIG.Item.dataModels = {
    arma: ArmaModel,
    armadura: ArmaduraModel,
    item: ItemModel,
    habilidade: HabilidadeModel,
  };
  registerEquipmentGuards();

  foundry.documents.collections.Actors.registerSheet(SYSTEM_ID, PersonagemSheet, {
    types: ['personagem'],
    makeDefault: true,
    label: 'DESORDEM.Ficha.Personagem',
  });
  foundry.documents.collections.Items.registerSheet(SYSTEM_ID, ItemSheet, {
    types: ['arma', 'armadura', 'item', 'habilidade'],
    makeDefault: true,
    label: 'DESORDEM.Item.Ficha',
  });

  // API para macros e para teste pelo console
  game.desordem = {
    rollTest,
    rollSkill,
    rollAptitude,
    rollCraft,
    rollOpposed,
    damageActor,
    rollInjuryTest,
    computeDamage,
    emotionalDamage,
    rollTraumaTest,
    invokeRelation,
    attackWithWeapon,
    useItem,
    endScene,
    healAlly,
    gainAnalysisMarkers,
  };
});

Hooks.on('renderChatMessageHTML', (message, html) => {
  renderRelationCard(message, html);
  renderEquipmentCard(message, html);
  renderTestButtons(message, html);
  renderTableCard(message, html);
});

Hooks.once('ready', () => {
  registerRelationSocket();
  registerAbilitySocket();
  registerTableSocket();
  console.log(`${SYSTEM_ID} | pronto`);
});
