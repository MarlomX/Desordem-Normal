import { SYSTEM_ID, ATRIBUTOS, PERICIAS, APTIDOES, OFICIOS } from './config.js';
import PersonagemModel from './data/personagem.js';
import { CriaturaModel } from './data/ameaca.js';
import { ArmaModel, ArmaduraModel, ItemModel, HabilidadeModel, EfeitoModel } from './data/items.js';
import { migrateWorldConditions, registerConditionEffects } from './sheets/condition-effects-ui.js';
import PersonagemSheet from './sheets/personagem-sheet.js';
import CriaturaSheet from './sheets/criatura-sheet.js';
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
import { registerPhaseTracker } from './combat/phases-tracker.js';
import { registerDefaultItems } from './data/default-items.js';
import { registerTokenLink } from './data/token-link.js';
import { registerFirstAidHooks, renderFirstAidButton } from './rolls/first-aid-chat.js';
import { registerBonusDiceHooks, renderBonusDiceButton } from './rolls/bonus-dice-chat.js';
import { proposeOpposed, registerOpposedHooks, renderOpposedCard } from './opposed/opposed-chat.js';
import { challengeApi, readyChallenges, registerChallenges } from './challenges/hooks.js';
import { renderChallengeBar } from './challenges/test-card.js';
import { renderBalanceCard } from './challenges/balance-card.js';
import { renderLockAttempt } from './challenges/lock-card.js';
import {
  rollTest,
  rollSkill,
  rollAptitude,
  rollCraft,
  rollExtraSkill,
  rollOpposed,
} from './rolls/chat.js';
import { damageActor, rollInjuryTest } from './rolls/health.js';
import {
  attackWithWeapon,
  renderEquipmentCard,
  registerEquipmentSocket,
} from './rolls/equipment-chat.js';
import { registerGuardianSocket } from './rolls/guardian-chat.js';
import { registerEquipmentGuards } from './rolls/equipment-guard.js';
import {
  registerAbilityHooks,
  registerAbilitySocket,
  renderTestButtons,
  endScene,
  healAlly,
  gainAnalysisMarkers,
} from './rolls/abilities-chat.js';
import { newSceneForAll } from './rolls/scene-macro.js';
import { openChat, openSheet } from './mobile/macros.js';
import { registerDiceSoNice } from './dice3d/dice3d.js';
import { PontoInteresseModel } from './data/ponto.js';
import PontoInteresseSheet from './journal/point-sheet.js';
import { registerPointHooks, registerPointSettings } from './journal/point-hooks.js';
import { POINT_TYPE } from './journal/point.js';
import { renderPointBar } from './journal/investigation-app.js';
import { computeDamage } from './rolls/damage.js';
import { emotionalDamage, rollTraumaTest } from './rolls/mind.js';
import { renderTableCard, registerTableSocket } from './rolls/table-chat.js';
import {
  invokeRelation,
  renderRelationCard,
  registerRelationSocket,
} from './rolls/relation-chat.js';
import { registerItemUseSocket, renderItemUseCard, useItem } from './rolls/item-use-chat.js';

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
  // Criatura: o primeiro tipo de ameaça (modelo comum em data/ameaca.js)
  CONFIG.Actor.dataModels.criatura = CriaturaModel;
  CONFIG.Item.dataModels = {
    arma: ArmaModel,
    armadura: ArmaduraModel,
    item: ItemModel,
    habilidade: HabilidadeModel,
    // Efeito da aba Condição (v0.22.1): modelo no mundo ou num compêndio, copiado para a ficha
    efeito: EfeitoModel,
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
  // Combate por fases: barra da fase e áreas na aba de combate (só combates comuns)
  registerPhaseTracker();
  // Teste oposto pela ficha: o mestre registra os testes nos cartões
  registerOpposedHooks();
  // Fichas novas ganham a arma «Desarmado» (soco e chute, dano RB)
  registerDefaultItems();
  // Personagens novos nascem com o token-modelo vinculado (e a migração única dos existentes)
  registerTokenLink();
  // Primeiros socorros: o mestre conta as tentativas e aplica o resultado
  registerFirstAidHooks();
  // Dados bônus ao grupo: o mestre distribui pelo botão do teste
  registerBonusDiceHooks();
  // Ganhos de «início do combate» das habilidades
  registerAbilityHooks();
  // Tabelas de ações das criaturas: configuração do mundo, editada pelo mestre
  registerCreatureTables();
  // Desafios (teste estendido): configuração do mundo e a guia nova da barra lateral
  registerChallenges();
  registerEquipmentGuards();
  // Dice So Nice (v0.25.2, opcional): estilo do dado de pavor e a aura; sem o módulo, nada muda
  registerDiceSoNice();
  // Ponto de interesse (v0.24.0): subtipo de página do Diário, com folha própria e os ganchos que
  // mantêm o número na frente do nome da página («4.1 · Potes»)
  CONFIG.JournalEntryPage.dataModels[POINT_TYPE] = PontoInteresseModel;
  registerPointHooks();
  // Configuração do usuário: barra «Usar no ponto de interesse» nos cartões de teste (v0.24.6)
  registerPointSettings();
  foundry.applications.apps.DocumentSheetConfig.registerSheet(
    foundry.documents.JournalEntryPage,
    SYSTEM_ID,
    PontoInteresseSheet,
    { types: [POINT_TYPE], makeDefault: true, label: 'TYPES.JournalEntryPage.pontoInteresse' },
  );

  foundry.documents.collections.Actors.registerSheet(SYSTEM_ID, PersonagemSheet, {
    types: ['personagem'],
    makeDefault: true,
    label: 'DESORDEM.Ficha.Personagem',
  });
  foundry.documents.collections.Actors.registerSheet(SYSTEM_ID, CriaturaSheet, {
    types: ['criatura'],
    makeDefault: true,
    label: 'DESORDEM.Criatura.Ficha',
  });
  // Editor de efeitos compartilhado (ficha do item e janela do efeito da aba Condição) e as
  // proteções dos Items de efeito (eles não ficam embutidos num ator)
  registerConditionEffects();
  foundry.documents.collections.Items.registerSheet(SYSTEM_ID, ItemSheet, {
    types: ['arma', 'armadura', 'item', 'habilidade', 'efeito'],
    makeDefault: true,
    label: 'DESORDEM.Item.Ficha',
  });

  // API para macros e para teste pelo console
  game.desordem = {
    rollTest,
    rollSkill,
    rollAptitude,
    rollCraft,
    rollExtraSkill,
    rollOpposed,
    proposeOpposed,
    damageActor,
    rollInjuryTest,
    computeDamage,
    emotionalDamage,
    rollTraumaTest,
    invokeRelation,
    attackWithWeapon,
    useItem,
    endScene,
    // Macro do mestre: nova cena para os personagens dos jogadores (v0.23.3)
    newSceneForAll,
    // Macros do jogador para celular (v0.25.1): chat em janela e atalho para a ficha
    openChat,
    openSheet,
    healAlly,
    gainAnalysisMarkers,
    perseguicao: chaseApi,
    furtividade: stealthApi,
    desafios: challengeApi,
  };
});

Hooks.on('renderChatMessageHTML', (message, html) => {
  renderRelationCard(message, html);
  renderItemUseCard(message, html);
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
  renderOpposedCard(message, html);
  // Ponto de interesse (v0.24.4): barra do mestre «Usar no ponto de interesse» no cartão do teste
  renderPointBar(message, html);
  renderFirstAidButton(message, html);
  renderBonusDiceButton(message, html);
  renderFearDice(message, html);
});

Hooks.once('ready', () => {
  // Lesões, traumas e contusão viram efeitos (v0.22.2): o mestre grava a conversão uma vez
  migrateWorldConditions();
  registerRelationSocket();
  registerAbilitySocket();
  // Assumir ataque nos cartões e o dano aplicado do cartão de ataque (o mestre grava)
  registerGuardianSocket();
  registerEquipmentSocket();
  // Cartões de passo de item (o mestre marca quem recebeu)
  registerItemUseSocket();
  registerTableSocket();
  registerChaseSocket();
  registerStealthSocket();
  readyChallenges();
  console.log(`${SYSTEM_ID} | pronto`);
});
