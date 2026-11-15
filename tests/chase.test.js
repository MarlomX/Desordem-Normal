import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import {
  CHASE_COMBAT_TYPE,
  CHASE_COMBATANT_TYPE,
  initialChaseState,
  startState,
  endState,
  addableActors,
  chaseAccess,
  trackerAction,
  shouldAutoOpen,
} from '../scripts/rolls/chase.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('estados do ciclo de vida: preparação, em andamento e de volta à preparação', () => {
  assert.deepEqual(initialChaseState(), { ativa: false, rodadaAtual: 0 });
  assert.deepEqual(startState(), { ativa: true, rodadaAtual: 1 });
  assert.deepEqual(endState(), { ativa: false, rodadaAtual: 0 });
});

test('estados devolvem objetos novos (ninguém altera o de outro)', () => {
  assert.notEqual(initialChaseState(), initialChaseState());
});

test('addableActors tira quem já participa e ordena por nome', () => {
  const candidates = [
    { id: 'c', name: 'Ótavo' },
    { id: 'a', name: 'Beatriz' },
    { id: 'b', name: 'Ana' },
  ];
  assert.deepEqual(
    addableActors(candidates, ['a']).map((actor) => actor.id),
    ['b', 'c'],
  );
  assert.deepEqual(addableActors(candidates, ['a', 'b', 'c']), []);
  assert.equal(addableActors(candidates, []).length, 3);
});

test('addableActors não altera a lista recebida', () => {
  const candidates = [
    { id: 'b', name: 'Bia' },
    { id: 'a', name: 'Ana' },
  ];
  addableActors(candidates, []);
  assert.deepEqual(
    candidates.map((actor) => actor.id),
    ['b', 'a'],
  );
});

test('acesso do mestre', () => {
  assert.deepEqual(chaseAccess({ isGM: true, chase: null, isParticipant: false }), {
    canCreate: true,
    canManage: false,
    canOpen: false,
    showCard: false,
  });
  const prep = chaseAccess({ isGM: true, chase: { ativa: false }, isParticipant: false });
  assert.equal(prep.canCreate, false);
  assert.equal(prep.canManage, true);
  assert.equal(prep.canOpen, true);
  assert.equal(prep.showCard, false);
});

test('o mestre vê o cartão de um participante mesmo na preparação', () => {
  const access = chaseAccess({ isGM: true, chase: { ativa: false }, isParticipant: true });
  assert.equal(access.showCard, true);
});

test('o jogador só abre a perseguição em andamento e se participar', () => {
  const open = (ativa, isParticipant) =>
    chaseAccess({ isGM: false, chase: { ativa }, isParticipant }).canOpen;
  assert.equal(open(true, true), true);
  assert.equal(open(true, false), false);
  assert.equal(open(false, true), false);
  assert.equal(chaseAccess({ isGM: false, chase: null, isParticipant: true }).canOpen, false);
});

test('o jogador nunca cria nem administra', () => {
  const access = chaseAccess({ isGM: false, chase: null, isParticipant: true });
  assert.equal(access.canCreate, false);
  assert.equal(access.canManage, false);
  assert.equal(
    chaseAccess({ isGM: false, chase: { ativa: true }, isParticipant: true }).canManage,
    false,
  );
});

test('o cartão da ficha do jogador só aparece com a perseguição em andamento', () => {
  const card = (ativa) => chaseAccess({ isGM: false, chase: { ativa }, isParticipant: true });
  assert.equal(card(true).showCard, true);
  assert.equal(card(false).showCard, false);
  assert.equal(
    chaseAccess({ isGM: false, chase: { ativa: true }, isParticipant: false }).showCard,
    false,
  );
});

test('botão da aba de combate: criar, abrir ou nada', () => {
  assert.equal(
    trackerAction(chaseAccess({ isGM: true, chase: null, isParticipant: false })),
    'criar',
  );
  assert.equal(
    trackerAction(chaseAccess({ isGM: true, chase: { ativa: false }, isParticipant: false })),
    'abrir',
  );
  assert.equal(
    trackerAction(chaseAccess({ isGM: false, chase: { ativa: true }, isParticipant: true })),
    'abrir',
  );
  assert.equal(
    trackerAction(chaseAccess({ isGM: false, chase: { ativa: false }, isParticipant: true })),
    null,
  );
  assert.equal(
    trackerAction(chaseAccess({ isGM: false, chase: null, isParticipant: false })),
    null,
  );
});

test('abertura automática da janela', () => {
  const gmAuthor = { isGM: true, isAuthor: true, ownsParticipant: true };
  const gmOther = { isGM: true, isAuthor: false, ownsParticipant: true };
  const player = { isGM: false, isAuthor: false, ownsParticipant: true };
  const outsider = { isGM: false, isAuthor: false, ownsParticipant: false };

  assert.equal(shouldAutoOpen('created', gmAuthor), true);
  assert.equal(shouldAutoOpen('created', gmOther), false);
  assert.equal(shouldAutoOpen('created', player), false);

  assert.equal(shouldAutoOpen('started', gmAuthor), true);
  assert.equal(shouldAutoOpen('started', gmOther), false);
  assert.equal(shouldAutoOpen('started', player), true);
  assert.equal(shouldAutoOpen('started', outsider), false);

  assert.equal(shouldAutoOpen('joined', player), true);
  assert.equal(shouldAutoOpen('joined', outsider), false);
  assert.equal(shouldAutoOpen('joined', gmAuthor), false);

  assert.equal(shouldAutoOpen('desconhecido', player), false);
});

test('o system.json registra os subtipos de Combat e de Combatant', () => {
  const { documentTypes } = JSON.parse(read('system.json'));
  assert.ok(documentTypes.Combat?.[CHASE_COMBAT_TYPE]);
  assert.ok(documentTypes.Combatant?.[CHASE_COMBATANT_TYPE]);
});

test('os templates da perseguição existem', () => {
  for (const file of ['painel.hbs', 'adicionar.hbs']) {
    assert.ok(existsSync(new URL(`../templates/perseguicao/${file}`, import.meta.url)), file);
  }
  assert.ok(existsSync(new URL('../templates/actor/ficha-perseguicao.hbs', import.meta.url)));
});

// ---- 0.16.1: avançar ----
import {
  ADVANCE_DT,
  ADVANCE_SKILL,
  breathDice,
  participantStart,
  participantReset,
  hasActed,
  canAdvance,
  skillAllowed,
  breathLimit,
  effortDiceCount,
  advanceGain,
  applyAdvance,
  applyEffortLoss,
  adjustField,
  isAdjustableField,
  nextRoundState,
  sanitizeParticipantPatch,
} from '../scripts/rolls/chase.js';

test('constantes do avançar', () => {
  assert.equal(ADVANCE_DT, 10);
  assert.equal(ADVANCE_SKILL, 'atletismo');
});

test('fôlego: metade das faces do Vigor, no máximo 6', () => {
  assert.deepEqual([4, 6, 8, 10, 12].map(breathDice), [2, 3, 4, 5, 6]);
  assert.equal(breathDice(20), 6);
  assert.equal(breathDice(undefined), 0);
});

test('participantStart e participantReset', () => {
  assert.deepEqual(participantStart(10), {
    pa: 0,
    folego: 5,
    esforcoExtra: 0,
    ultimaRodada: 0,
    periciasUsadas: [],
    carregadoPor: '',
  });
  assert.equal(participantReset().folego, 0);
  assert.notEqual(participantStart(6).periciasUsadas, participantStart(6).periciasUsadas);
});

test('uma ação por rodada', () => {
  const base = { ativa: true, rodadaAtual: 2 };
  assert.equal(canAdvance({ ...base, participant: { ultimaRodada: 1 } }), true);
  assert.equal(canAdvance({ ...base, participant: { ultimaRodada: 2 } }), false);
  assert.equal(
    canAdvance({ ativa: false, rodadaAtual: 0, participant: { ultimaRodada: 0 } }),
    false,
  );
  assert.equal(hasActed({ ultimaRodada: 0 }, 0), false);
  assert.equal(hasActed({ ultimaRodada: 3 }, 3), true);
});

test('outras perícias só uma vez; Atletismo sempre', () => {
  assert.equal(skillAllowed('atletismo', ['atletismo']), true);
  assert.equal(skillAllowed('acrobacia', []), true);
  assert.equal(skillAllowed('acrobacia', ['acrobacia']), false);
});

test('limite de fôlego por teste', () => {
  assert.deepEqual([0, 1, 2, 5].map(breathLimit), [0, 1, 2, 2]);
  assert.equal(breathLimit(-3), 0);
});

test('esforço extra custa um d4 a mais a cada uso', () => {
  assert.deepEqual([0, 1, 2, 3].map(effortDiceCount), [1, 2, 3, 4]);
});

test('ganho de PA: rolagem alta ao passar (as duas no crítico), baixa ao falhar', () => {
  assert.equal(advanceGain({ success: true, highSum: 8, lowRoll: 3 }), 8);
  assert.equal(advanceGain({ success: true, highSum: 14, lowRoll: 6 }), 14);
  assert.equal(advanceGain({ success: false, highSum: 7, lowRoll: 2 }), 2);
});

test('applyAdvance soma PA, gasta fôlego e registra rodada, esforço e perícia', () => {
  const participant = { pa: 5, folego: 3, esforcoExtra: 1, periciasUsadas: ['luta'] };
  const next = applyAdvance(participant, {
    gain: 7,
    breathSpent: 2,
    effort: true,
    skillKey: 'acrobacia',
    rodadaAtual: 2,
  });
  assert.deepEqual(next, {
    pa: 12,
    folego: 1,
    esforcoExtra: 2,
    ultimaRodada: 2,
    periciasUsadas: ['luta', 'acrobacia'],
  });
  assert.deepEqual(participant.periciasUsadas, ['luta']);
});

test('applyAdvance: Atletismo não entra na lista de perícias usadas; fôlego não fica negativo', () => {
  const next = applyAdvance(
    { pa: 0, folego: 1, esforcoExtra: 0, periciasUsadas: [] },
    { gain: 4, breathSpent: 2, effort: false, skillKey: 'atletismo', rodadaAtual: 1 },
  );
  assert.deepEqual(next.periciasUsadas, []);
  assert.equal(next.folego, 0);
  assert.equal(next.esforcoExtra, 0);
});

test('perda de PV do esforço extra nunca fica abaixo de 0 e avisa ao chegar em 0', () => {
  assert.deepEqual(applyEffortLoss(10, 3), { pv: 7, reachedZero: false });
  assert.deepEqual(applyEffortLoss(3, 3), { pv: 0, reachedZero: true });
  assert.deepEqual(applyEffortLoss(2, 9), { pv: 0, reachedZero: true });
  assert.deepEqual(applyEffortLoss(0, 0), { pv: 0, reachedZero: false });
});

test('ajuste manual: nunca abaixo de 0; fôlego limitado a 6', () => {
  assert.equal(adjustField('pa', 3, -1), 2);
  assert.equal(adjustField('pa', 0, -1), 0);
  assert.equal(adjustField('pa', 29, 1), 30);
  assert.equal(adjustField('folego', 6, 1), 6);
  assert.equal(adjustField('folego', 0, -1), 0);
  assert.equal(isAdjustableField('pa'), true);
  assert.equal(isAdjustableField('esforcoExtra'), false);
});

test('próxima rodada', () => {
  assert.deepEqual(nextRoundState(1), { rodadaAtual: 2 });
});

test('o pedido de gravação por socket é limpo', () => {
  const skills = ['atletismo', 'acrobacia'];
  assert.deepEqual(
    sanitizeParticipantPatch(
      {
        pa: 12,
        folego: -1,
        esforcoExtra: 1.5,
        ultimaRodada: 3,
        periciasUsadas: ['acrobacia', 'acrobacia', 'hack'],
        carregadoPor: 'x',
        system: { evil: true },
      },
      skills,
    ),
    { pa: 12, ultimaRodada: 3, periciasUsadas: ['acrobacia'] },
  );
  assert.deepEqual(sanitizeParticipantPatch(null, skills), {});
  assert.deepEqual(sanitizeParticipantPatch({ pa: '9' }, skills), {});
});
