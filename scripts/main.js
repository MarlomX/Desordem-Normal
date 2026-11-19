import { SYSTEM_ID, ATRIBUTOS, PERICIAS, APTIDOES, OFICIOS } from './config.js';
import PersonagemModel from './data/personagem.js';
import { ArmaModel, ArmaduraModel, ItemModel, HabilidadeModel } from './data/items.js';
import PersonagemSheet from './sheets/personagem-sheet.js';
import { fearDieHelper } from './sheets/dado-pavor.js';
import { dieFaceHelper } from './rolls/die-face.js';
import { renderFearDice } from './rolls/fear-chat.js';
import ItemSheet from './sheets/item-sheet.js';
import { PerseguicaoModel, ParticipanteModel } from './chase/models.js';
import { renderAdvanceBar } from './chase/advance-card.js';
import { renderEffortBar } from './chase/effort-card.js';
import { renderPenaltyBar } from './chase/penalty-card.js';
import { registerChaseHooks, registerChaseSocket, chaseApi } from './chase/hooks.js';
import { FurtividadeModel, FurtivoModel } from './stealth/models.js';
import { registerStealthHooks, registerStealthSocket, stealthApi } from './stealth/hooks.js';
import { renderHideBar } from './stealth/hide-test.js';
import { renderSearchBar } from './stealth/search.js';
import { renderActionBar } from './stealth/action.js';
import { registerCreatureTables } from './stealth/tables.js';
import { challengeApi, readyChallenges, registerChallenges } from './challenges/hooks.js';
import { renderChallengeBar } from './challenges/test-card.js';
import { renderBalanceCard } from './challenges/balance-card.js';
import { renderLockAttempt } from './challenges/lock-card.js';
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

  // Helper de template: {{dadoFace lados valor tamanho passo}} desenha a face de um dado nos cartões
  // do chat (veja scripts/rolls/die-face.js). Só dígitos passam para o HTML.
  Handlebars.registerHelper(
    'dadoFace',
    (sides, value, size, step) =>
      new Handlebars.SafeString(dieFaceHelper(sides, value, size, step)),
  );

  CONFIG.DESORDEM = { ATRIBUTOS, PERICIAS, APTIDOES, OFICIOS };
  CONFIG.Actor.dataModels.personagem = PersonagemModel;
  CONFIG.Item.dataModels = {
    arma: ArmaModel,
    armadura: ArmaduraModel,
    item: ItemModel,
    habilidade: HabilidadeModel,
  };
  // Perseguição: subtipos de Combat e de Combatant (cópia dos objetos existentes, por segurança)
  CONFIG.Combat.dataModels = { ...CONFIG.Combat.dataModels, perseguicao: PerseguicaoModel };
  CONFIG.Combatant.dataModels = { ...CONFIG.Combatant.dataModels, participante: ParticipanteModel };
  // Furtividade: mais um subtipo de Combat e de Combatant, no mesmo molde da perseguição
  CONFIG.Combat.dataModels.furtividade = FurtividadeModel;
  CONFIG.Combatant.dataModels.furtivo = FurtivoModel;
  CONFIG.Combat.typeLabels = {
    ...CONFIG.Combat.typeLabels,
    perseguicao: 'TYPES.Combat.perseguicao',
    furtividade: 'TYPES.Combat.furtividade',
  };
  CONFIG.Combatant.typeLabels = {
    ...CONFIG.Combatant.typeLabels,
    participante: 'TYPES.Combatant.participante',
    furtivo: 'TYPES.Combatant.furtivo',
  };
  registerChaseHooks();
  // Depois da perseguição: o botão da furtividade fica logo abaixo do dela na aba de combate
  registerStealthHooks();
  // Tabelas de ações das criaturas: configuração do mundo, editada pelo mestre
  registerCreatureTables();
  // Desafios (teste estendido): configuração do mundo e a guia nova da barra lateral
  registerChallenges();
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
    perseguicao: chaseApi,
    furtividade: stealthApi,
    desafios: challengeApi,
  };
});

Hooks.on('renderChatMessageHTML', (message, html) => {
  renderRelationCard(message, html);
  renderEquipmentCard(message, html);
  renderTestButtons(message, html);
  renderAdvanceBar(message, html);
  renderChallengeBar(message, html);
  renderBalanceCard(message, html);
  renderLockAttempt(message, html);
  renderEffortBar(message, html);
  renderPenaltyBar(message, html);
  renderHideBar(message, html);
  renderSearchBar(message, html);
  renderActionBar(message, html);
  renderTableCard(message, html);
  renderFearDice(message, html);
});

Hooks.once('ready', () => {
  registerRelationSocket();
  registerAbilitySocket();
  registerTableSocket();
  registerChaseSocket();
  registerStealthSocket();
  readyChallenges();
  console.log(`${SYSTEM_ID} | pronto`);
});
