/**
 * Furtividade: lógica pura (sem dependência do Foundry).
 *
 * Nesta versão (0.17.0, esqueleto) existem o ciclo de vida da cena, a lista de participantes e os
 * dados de esconderijo de cada um, editados à mão (acrescentar um dado, descartar um dado). O
 * teste de esconderijo, a procura das criaturas e as ações especiais chegam nas próximas versões.
 *
 * Ciclo de vida (igual ao da perseguição): preparação (ativa: false, rodada 0) --iniciar--> em
 * andamento (ativa: true, rodada 1) --encerrar--> volta à preparação. Só uma cena por vez.
 *
 * As regras de acesso (quem cria, quem abre, quando a janela abre sozinha) são as mesmas da
 * perseguição: `chaseAccess`, `trackerAction`, `shouldAutoOpen` e `addableActors` de chase.js
 * servem às duas cenas.
 */

/** Subtipos do encontro (Combat) e do participante (Combatant) registrados no system.json. */
export const STEALTH_COMBAT_TYPE = 'furtividade';
export const STEALTH_COMBATANT_TYPE = 'furtivo';

/** Lados aceitos num dado de esconderijo (os dados que um teste pode rolar). */
export const HIDE_DIE_SIDES = Object.freeze([4, 6, 8, 10, 12, 20]);

/**
 * Teto técnico de dados de esconderijo por personagem. Um teste rola no máximo 4 dados, mas
 * esconder-se e distrair acrescentam outros; 12 cobre qualquer cena sem permitir números absurdos.
 */
export const MAX_HIDE_DICE = 12;

/** Rodada máxima aceita ao mudar a rodada na mão. */
export const STEALTH_MAX_ROUND = 99;

/** Estado de uma cena recém-criada: em preparação, sem rodada, sem usos de distrair. */
export function initialStealthState() {
  return { ativa: false, rodadaAtual: 0, distrairUsos: 0 };
}

/** Estado ao iniciar a cena: ativa, na rodada 1, contador de distrair zerado. */
export function stealthStartState() {
  return { ativa: true, rodadaAtual: 1, distrairUsos: 0 };
}

/** Estado ao encerrar a cena: volta à preparação. */
export function stealthEndState() {
  return { ativa: false, rodadaAtual: 0, distrairUsos: 0 };
}

/**
 * Situação de um participante ao iniciar ou encerrar a cena: sem dados, sem teste feito e sem
 * usos de esconder-se.
 */
export function stealthParticipantReset() {
  return { esconderijo: [], escondeu: false, esconderUsos: 0 };
}

/** Próxima rodada (sem passar do teto). */
export function stealthNextRound(round) {
  return { rodadaAtual: Math.min(STEALTH_MAX_ROUND, Math.max(0, Math.trunc(round) || 0) + 1) };
}

/**
 * Rodada escolhida na mão (botões −/+ ou valor digitado). Vazio, texto ou fora de 1..99 não vale.
 * @param {number} current Rodada atual.
 * @param {{raw?: string|number, delta?: number}} change
 * @returns {{valid: boolean, value?: number}}
 */
export function stealthRoundChange(current, { raw, delta } = {}) {
  if (delta !== undefined) {
    const value = Math.min(STEALTH_MAX_ROUND, Math.max(1, (Math.trunc(current) || 0) + delta));
    return { valid: true, value };
  }
  // Texto vazio viraria 0 em Number(''): é tratado à parte, como inválido
  if (raw === null || raw === undefined || String(raw).trim() === '') return { valid: false };
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > STEALTH_MAX_ROUND) return { valid: false };
  return { valid: true, value };
}

/**
 * Um dado de esconderijo válido ({lados, valor}) ou `null`. Os lados precisam ser um dos dados do
 * jogo e o valor um inteiro de 1 até os lados. Aceita texto vindo de campos (`"8"`).
 */
export function normalizeHideDie(die) {
  if (!die || typeof die !== 'object') return null;
  if (die.lados === '' || die.valor === '' || die.lados == null || die.valor == null) return null;
  const lados = Number(die.lados);
  const valor = Number(die.valor);
  if (!HIDE_DIE_SIDES.includes(lados)) return null;
  if (!Number.isInteger(valor) || valor < 1 || valor > lados) return null;
  return { lados, valor };
}

/** Só os dados válidos de uma lista (dados guardados mal formados são ignorados). */
export function cleanHideDice(list) {
  if (!Array.isArray(list)) return [];
  return list.map(normalizeHideDie).filter(Boolean).slice(0, MAX_HIDE_DICE);
}

/**
 * Aplica uma operação sobre os dados de esconderijo de um participante. Nunca altera a lista
 * recebida. As operações vêm da janela (ou de um jogador, pelo socket), então tudo é conferido.
 * - `{type: 'add', lados, valor}`: acrescenta um dado (até o teto).
 * - `{type: 'remove', index}`: descarta o dado daquela posição.
 * @param {{lados: number, valor: number}[]} list Dados atuais.
 * @param {object} op
 * @returns {{valid: boolean, list: {lados: number, valor: number}[], reason?: string}}
 *   `reason`: 'dado' (dado inválido), 'cheio' (teto atingido), 'indice' ou 'operacao'.
 */
export function applyHideOp(list, op) {
  const current = cleanHideDice(list);
  if (op?.type === 'add') {
    const die = normalizeHideDie(op);
    if (!die) return { valid: false, list: current, reason: 'dado' };
    if (current.length >= MAX_HIDE_DICE) return { valid: false, list: current, reason: 'cheio' };
    return { valid: true, list: [...current, die] };
  }
  if (op?.type === 'remove') {
    // Vazio viraria 0 em Number('') e descartaria o primeiro dado: é tratado à parte
    const blank = op.index === null || op.index === undefined || String(op.index).trim() === '';
    const index = blank ? NaN : Number(op.index);
    if (!Number.isInteger(index) || index < 0 || index >= current.length) {
      return { valid: false, list: current, reason: 'indice' };
    }
    // Com `lados`/`valor` esperados (escolhidos antes, numa janela), o dado daquela posição precisa
    // ser o mesmo: se a lista mudou nesse meio-tempo, nada é descartado
    const die = current[index];
    const sidesMismatch = op.lados !== undefined && op.lados !== null && die.lados !== op.lados;
    const valueMismatch = op.valor !== undefined && op.valor !== null && die.valor !== op.valor;
    if (sidesMismatch || valueMismatch) return { valid: false, list: current, reason: 'mudou' };
    return { valid: true, list: current.filter((_, position) => position !== index) };
  }
  return { valid: false, list: current, reason: 'operacao' };
}

/**
 * Operação limpa para mandar pelo socket: só os campos esperados, como números. O mestre ainda
 * confere tudo de novo em `applyHideOp` antes de gravar.
 * @returns {object|null} `null` se não for uma operação conhecida.
 */
export function sanitizeHideOp(op) {
  if (op?.type === 'add') return { type: 'add', lados: Number(op.lados), valor: Number(op.valor) };
  if (op?.type === 'remove') {
    // Índice vazio vira `null` (inválido), não 0
    const blank = op.index === null || op.index === undefined || String(op.index).trim() === '';
    const expected = (value) =>
      value === null || value === undefined || value === '' ? undefined : Number(value);
    return {
      type: 'remove',
      index: blank ? null : Number(op.index),
      lados: expected(op.lados),
      valor: expected(op.valor),
    };
  }
  return null;
}

/**
 * Situação de um participante na cena.
 * - 'preparacao': a cena ainda não começou;
 * - 'aguardando': começou, mas o personagem ainda não registrou dados de esconderijo;
 * - 'escondido': tem pelo menos um dado;
 * - 'encontrado': já se escondeu e perdeu todos os dados.
 * @param {{ativa: boolean, escondeu: boolean, count: number}} params
 */
export function hideStatus({ ativa, escondeu, count }) {
  if (!ativa) return 'preparacao';
  if (count > 0) return 'escondido';
  return escondeu ? 'encontrado' : 'aguardando';
}

/**
 * Quem vê os VALORES dos dados de esconderijo de um participante. O mestre do Foundry é dono de
 * todos os personagens, então "ser dono" não basta: ele só vê depois de revelar (com confirmação
 * e aviso no chat). O jogador dono sempre vê os próprios dados.
 * @param {{isGM: boolean, isOwner: boolean, revealed: boolean}} params
 */
export function canSeeHideValues({ isGM, isOwner, revealed }) {
  if (isGM) return Boolean(revealed);
  return Boolean(isOwner);
}

/**
 * Quem pode acrescentar ou descartar dados à mão: o jogador dono (sempre) e o mestre só com os
 * dados daquele participante revelados (para não mexer às cegas).
 */
export function canEditHideDice({ isGM, isOwner, revealed, ativa }) {
  if (!ativa) return false;
  return canSeeHideValues({ isGM, isOwner, revealed });
}

/**
 * Dados de um participante prontos para a janela. A quantidade e a situação são públicas; os
 * valores só aparecem para quem pode vê-los (lista vazia para os demais).
 * @param {{ativa: boolean, escondeu: boolean, esconderijo: object[], isGM: boolean,
 *   isOwner: boolean, revealed: boolean}} params
 */
export function hideDiceView({ ativa, escondeu, esconderijo, isGM, isOwner, revealed }) {
  const dice = cleanHideDice(esconderijo);
  const visible = canSeeHideValues({ isGM, isOwner, revealed });
  return {
    count: dice.length,
    status: hideStatus({ ativa, escondeu, count: dice.length }),
    visible,
    canEdit: canEditHideDice({ isGM, isOwner, revealed, ativa }),
    dice: visible ? dice.map((die, index) => ({ ...die, index })) : [],
  };
}

/**
 * Patch gravado depois de uma operação: a lista nova e, ao acrescentar, a marca de que o
 * personagem já se escondeu (é ela que separa "aguardando" de "encontrado").
 */
export function hideOpPatch(op, list, escondeu) {
  return { esconderijo: list, escondeu: Boolean(escondeu) || op?.type === 'add' };
}

/**
 * Que mensagem do chat a operação gera: 'adicionou', 'descartou' ou 'encontrado' (descartou o
 * último dado). As mensagens mostram só quantidades, nunca valores.
 */
export function hideOpMessage(op, countAfter, motivo) {
  if (op?.type === 'add') return 'adicionou';
  if (op?.type === 'remove') {
    // Ação chamativa: mensagem própria (e a de encontrado, se foi o último dado)
    if (motivo === 'chamativa') return countAfter === 0 ? 'chamativaEncontrado' : 'chamativa';
    return countAfter === 0 ? 'encontrado' : 'descartou';
  }
  return null;
}

/** Motivos aceitos numa operação (o socket só deixa passar estes). */
export const HIDE_OP_REASONS = Object.freeze(['chamativa']);

/** Motivo limpo de uma operação (`undefined` se não for conhecido). */
export function sanitizeReason(motivo) {
  return HIDE_OP_REASONS.includes(motivo) ? motivo : undefined;
}

// ---------------------------------------------------------------------------------------------
// Teste de esconderijo (0.17.1)
//
// É uma opção da janela pré-teste («usar como teste de esconderijo»), oferecida só a quem ainda
// está «sem esconderijo». O teste não tem DT, não sofre o dado de pavor e vai para o chat como
// rolagem privada (só quem rolou vê). O resultado não é somado: os dados viram dados de
// esconderijo quando o jogador aperta o botão do cartão. Até lá, a Análise e a Prontidão podem
// mudar os valores, porque o botão lê os dados como o cartão os mostra no momento do clique.
// ---------------------------------------------------------------------------------------------

/** Quantos dados do teste viram dados de esconderijo (a norma do sistema: 3 valem). */
export const HIDE_TEST_KEEP = 3;

/** Tempo (ms) até uma reserva de clique parada deixar de bloquear o botão. */
export const HIDE_CLAIM_TIMEOUT_MS = 30_000;

/**
 * A janela pré-teste deve oferecer o teste de esconderijo? Só com a cena em andamento, para um
 * participante que ainda não se escondeu, num personagem que a pessoa controla.
 * @param {{ativa: boolean, isParticipant: boolean, isOwner: boolean, escondeu: boolean}} params
 */
export function canOfferHideTest({ ativa, isParticipant, isOwner, escondeu }) {
  return Boolean(ativa && isParticipant && isOwner && !escondeu);
}

/** Registro guardado na mensagem do teste de esconderijo (flag `esconderijo`). */
export function createHideFlag({ combatantId }) {
  return {
    combatantId,
    estado: 'pendente',
    reservadoEm: null,
    // Preenchidos quando os dados são guardados (só quantidades e valores do próprio cartão)
    dados: null,
    extra: null,
  };
}

const isStaleHideClaim = (flag, now) =>
  flag.estado === 'aplicando' && now - (flag.reservadoEm ?? 0) > HIDE_CLAIM_TIMEOUT_MS;

/** O botão pode ser usado agora? (pendente, ou reserva parada há tempo demais) */
export const isHideClaimable = (flag, now) =>
  flag?.estado === 'pendente' || isStaleHideClaim(flag ?? {}, now);

/** Reserva o clique (contra o duplo clique). `null` se já foi usado ou está em uso. */
export function reserveHide(flag, now) {
  if (!isHideClaimable(flag, now)) return null;
  return { ...flag, estado: 'aplicando', reservadoEm: now };
}

/** Conclui o clique: guarda os dados que viraram esconderijo e o dado extra do crítico. */
export function finishHide(flag, { dados, extra }) {
  return { ...flag, estado: 'aplicado', reservadoEm: null, dados, extra: extra ?? null };
}

/** Desfaz a reserva quando a gravação falhou, para o jogador poder tentar de novo. */
export function releaseHide(flag) {
  return { ...flag, estado: 'pendente', reservadoEm: null };
}

/**
 * Índices dos dados que ficam por padrão: todos, se o teste rolou até 3; com 4, os 3 maiores
 * valores (no empate, o que veio primeiro).
 * @param {number[]} values Valores rolados.
 * @returns {number[]} Índices em ordem crescente.
 */
export function defaultHideKeep(values) {
  const indices = values.map((_, index) => index);
  if (values.length <= HIDE_TEST_KEEP) return indices;
  return indices
    .sort((a, b) => values[b] - values[a] || a - b)
    .slice(0, HIDE_TEST_KEEP)
    .sort((a, b) => a - b);
}

/**
 * Confere a escolha do jogador de quais dados ficam. Até 3 dados rolados: ficam todos (a escolha é
 * ignorada). Com 4: precisa ser exatamente 3 índices diferentes e válidos.
 * @returns {number[]|null} Índices em ordem crescente, ou `null` se a escolha não vale.
 */
export function normalizeHideKeep(values, keep) {
  if (values.length <= HIDE_TEST_KEEP) return values.map((_, index) => index);
  if (!Array.isArray(keep)) return null;
  const chosen = [
    ...new Set(
      keep.filter((index) => index !== null && index !== '' && index !== undefined).map(Number),
    ),
  ];
  if (chosen.length !== HIDE_TEST_KEEP) return null;
  if (!chosen.every((index) => Number.isInteger(index) && index >= 0 && index < values.length)) {
    return null;
  }
  return chosen.sort((a, b) => a - b);
}

/** Dados de esconderijo a partir dos dados escolhidos do teste. */
export function hideDiceFromTest({ sides, values, keep }) {
  return keep.map((index) => ({ lados: sides[index], valor: values[index] })).map(normalizeHideDie);
}

/**
 * Lados do dado extra do crítico: o maior dado do teste (mecanicamente, sempre a melhor escolha).
 * Esse dado é uma exceção às regras de limite: entra mesmo que o teste já tenha rolado 4 dados.
 */
export function critExtraSides(sides) {
  const valid = sides.filter((value) => HIDE_DIE_SIDES.includes(value));
  return valid.length ? Math.max(...valid) : 0;
}

/**
 * O que a barra do cartão mostra.
 * @param {object} flag Registro do esconderijo da mensagem.
 * @param {{sides: number[], values: number[], critical: boolean}} test Dados como o cartão os
 *   mostra agora e se o teste é um sucesso crítico.
 * @param {{canApply: boolean, alreadyHidden: boolean, now: number}} viewer
 */
export function hideBarView(flag, { sides, values, critical }, { canApply, alreadyHidden, now }) {
  const applied = flag?.estado === 'aplicado';
  return {
    applied,
    appliedCount: applied ? (flag.dados?.length ?? 0) + (flag.extra ? 1 : 0) : 0,
    extra: applied ? flag.extra : null,
    busy: flag?.estado === 'aplicando' && !isStaleHideClaim(flag, now),
    mustChoose: values.length > HIDE_TEST_KEEP,
    keepCount: Math.min(values.length, HIDE_TEST_KEEP),
    critical: Boolean(critical),
    critSides: critical ? critExtraSides(sides) : 0,
    alreadyHidden: !applied && Boolean(alreadyHidden),
    showButton: Boolean(canApply) && !alreadyHidden && isHideClaimable(flag, now),
  };
}

/** Patch do participante ao guardar o teste de esconderijo (substitui a lista e marca escondeu). */
export function hideTestPatch(dice) {
  return { esconderijo: cleanHideDice(dice), escondeu: true };
}

// ---------------------------------------------------------------------------------------------
// Procura das criaturas (0.17.3)
//
// O mestre digita dados (`2d6`, `d10`) e/ou valores (`3 5`) na janela de procura. Os dados são
// rolados em público e, junto com os valores digitados, formam a lista de valores procurados.
// Cada alvo perde TODOS os dados de esconderijo com valor igual a algum valor procurado (os
// valores não são somados). O cálculo é feito pelo mestre, a partir dos dados guardados no
// participante; o cartão só mostra quantidades.
// ---------------------------------------------------------------------------------------------

/** Lados aceitos nos dados da procura e maior valor que se pode digitar. */
export const SEARCH_MIN_SIDES = 2;
export const SEARCH_MAX_SIDES = 20;

/** Máximo de dados numa mesma parcela (`10d6`) e de parcelas no campo. */
export const SEARCH_MAX_COUNT = 10;
export const SEARCH_MAX_TERMS = 12;

/**
 * Lê o campo da procura. Aceita dados (`2d6`, `d10`, `1D8`) e valores (`3`, `5`), separados por
 * espaço, vírgula, ponto e vírgula ou `+`. Qualquer outra coisa invalida o campo inteiro.
 * @param {string} text
 * @returns {{valid: boolean, dice: {count: number, sides: number}[], values: number[],
 *   reason?: string}} `reason`: 'vazio', 'termo' (algo que não é dado nem valor) ou 'muitos'.
 */
export function parseSearchInput(text) {
  const tokens = String(text ?? '')
    .split(/[\s,;+]+/)
    .map((token) => token.trim())
    .filter(Boolean);
  if (tokens.length === 0) return { valid: false, dice: [], values: [], reason: 'vazio' };
  if (tokens.length > SEARCH_MAX_TERMS) {
    return { valid: false, dice: [], values: [], reason: 'muitos' };
  }
  const dice = [];
  const values = [];
  for (const token of tokens) {
    const die = /^(\d*)[dD](\d+)$/.exec(token);
    if (die) {
      const count = die[1] === '' ? 1 : Number(die[1]);
      const sides = Number(die[2]);
      const okCount = Number.isInteger(count) && count >= 1 && count <= SEARCH_MAX_COUNT;
      const okSides = sides >= SEARCH_MIN_SIDES && sides <= SEARCH_MAX_SIDES;
      if (!okCount || !okSides) return { valid: false, dice: [], values: [], reason: 'termo' };
      dice.push({ count, sides });
      continue;
    }
    if (/^\d+$/.test(token)) {
      const value = Number(token);
      if (value < 1 || value > SEARCH_MAX_SIDES) {
        return { valid: false, dice: [], values: [], reason: 'termo' };
      }
      values.push(value);
      continue;
    }
    return { valid: false, dice: [], values: [], reason: 'termo' };
  }
  return { valid: true, dice, values };
}

/** Fórmula para o motor de dados (`2d6 + 1d10`), ou '' sem dados. */
export function searchFormula(dice) {
  return dice.map(({ count, sides }) => `${count}d${sides}`).join(' + ');
}

/**
 * Valores procurados a partir dos dados rolados (com lados) e dos valores digitados (sem lados,
 * `lados: 0`). A ordem é a dos dados rolados e depois a dos digitados.
 * @param {{lados: number, valor: number}[]} rolled
 * @param {number[]} typed
 */
export function searchValues(rolled, typed) {
  return [
    ...rolled.map(({ lados, valor }) => ({ lados, valor })),
    ...typed.map((valor) => ({ lados: 0, valor })),
  ];
}

/**
 * Aplica a procura aos dados de esconderijo de um alvo: descarta todos os dados cujo valor aparece
 * entre os valores procurados. Nunca altera a lista recebida.
 * @param {{lados: number, valor: number}[]} dice Dados de esconderijo do alvo.
 * @param {number[]} values Valores procurados.
 * @returns {{list: {lados: number, valor: number}[], lost: number}}
 */
export function applySearchToDice(dice, values) {
  const current = cleanHideDice(dice);
  const wanted = new Set(values.map(Number));
  const list = current.filter((die) => !wanted.has(die.valor));
  return { list, lost: current.length - list.length };
}

/** Como descrever o resultado de um alvo: 'nada', 'perdeu' ou 'encontrado'. */
export function searchResultKind(lost, remaining) {
  if (lost === 0) return 'nada';
  return remaining === 0 ? 'encontrado' : 'perdeu';
}

/**
 * Quem pode ser alvo da procura: só quem está escondido (com pelo menos um dado).
 * @param {{id: string, name: string, status: string}[]} participants
 */
export function searchCandidates(participants) {
  return participants.filter((participant) => participant.status === 'escondido');
}

/**
 * Alvos escolhidos pelo mestre.
 * @param {{id: string, name: string}[]} candidates Só os escondidos (veja `searchCandidates`).
 * @param {{mode: 'todos'|'sorteado'|'escolhido', chosenId?: string}} choice
 * @param {() => number} [random] Gerador de 0 a 1 (Math.random por padrão; os testes trocam).
 * @returns {{id: string, name: string}[]} Vazio se não há alvo válido.
 */
export function pickSearchTargets(candidates, { mode, chosenId }, random = Math.random) {
  if (candidates.length === 0) return [];
  if (mode === 'todos') return [...candidates];
  if (mode === 'escolhido') {
    const found = candidates.find((candidate) => candidate.id === chosenId);
    return found ? [found] : [];
  }
  if (mode === 'sorteado') {
    const index = Math.min(candidates.length - 1, Math.floor(random() * candidates.length));
    return [candidates[index]];
  }
  return [];
}

/** Registro guardado no cartão da procura (flag `procura`): valores e um resultado por alvo. */
export function createSearchFlag({ values, targets }) {
  return {
    valores: values.map(({ lados, valor }) => ({ lados, valor })),
    alvos: targets.map(({ id, name }) => ({
      combatantId: id,
      nome: name,
      estado: 'pendente',
      perdeu: null,
      restam: null,
      resultado: null,
    })),
  };
}

/** Ids dos alvos ainda pendentes do cartão. */
export function pendingSearchTargets(flag) {
  return (flag?.alvos ?? [])
    .filter((target) => target.estado === 'pendente')
    .map((target) => target.combatantId);
}

/**
 * Registra no cartão o resultado de um alvo. Alvo que já foi resolvido não muda (uso único).
 * `resultado` é 'nada', 'perdeu', 'encontrado' ou 'ignorado' (já não estava escondido).
 */
export function resolveSearchTarget(flag, combatantId, { perdeu, restam, resultado }) {
  return {
    ...flag,
    alvos: flag.alvos.map((target) =>
      target.combatantId === combatantId && target.estado === 'pendente'
        ? { ...target, estado: 'aplicado', perdeu, restam, resultado }
        : target,
    ),
  };
}

// ---------------------------------------------------------------------------------------------
// Esconder-se e distrair (0.17.6)
//
// Os dois são testes com DT (7, mais 3 a cada uso). O contador do esconder-se é de cada
// personagem; o do distrair é da cena (qualquer personagem conta). O contador sobe ao ROLAR,
// passando ou não. Se passar, um dos dados rolados vira dado de esconderijo: de quem rolou
// (esconder-se) ou de quem foi escolhido antes de rolar (distrair: o próprio ou um aliado,
// escondido ou encontrado). Vão como rolagem privada e sofrem o dado de pavor normalmente.
// ---------------------------------------------------------------------------------------------

/** DT base das ações especiais e quanto ela sobe a cada uso. */
export const STEALTH_ACTION_DT = 7;
export const STEALTH_ACTION_STEP = 3;

/** Teto técnico dos contadores de uso. */
export const STEALTH_MAX_USES = 30;

/** Ações especiais que são testes (a vaga da janela pré-teste). */
export const STEALTH_TEST_ACTIONS = Object.freeze(['esconder', 'distrair']);

/** Contador de usos válido (inteiro de 0 a 30). */
export function normalizeUses(value) {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, STEALTH_MAX_USES);
}

/** DT da próxima vez que a ação for usada: 7, 10, 13... */
export function stealthActionDt(uses) {
  return STEALTH_ACTION_DT + STEALTH_ACTION_STEP * normalizeUses(uses);
}

/**
 * O que a seção de furtividade da janela pré-teste oferece a um personagem:
 * - `teste`: o teste de esconderijo (só para quem ainda não se escondeu);
 * - `esconder`: esconder-se (para quem já se escondeu: escondido ou encontrado), com a DT;
 * - `distrair`: distrair (para qualquer participante), com a DT e os destinos possíveis.
 * Devolve `null` se nada deve aparecer.
 * @param {{ativa: boolean, isParticipant: boolean, isOwner: boolean, escondeu: boolean,
 *   esconderUsos: number, distrairUsos: number, recipients: {id: string, name: string}[]}} p
 */
export function stealthOptions({
  ativa,
  isParticipant,
  isOwner,
  escondeu,
  esconderUsos,
  distrairUsos,
  recipients = [],
}) {
  if (!ativa || !isParticipant || !isOwner) return null;
  return {
    teste: !escondeu,
    esconder: escondeu ? { dt: stealthActionDt(esconderUsos) } : null,
    distrair: recipients.length ? { dt: stealthActionDt(distrairUsos), recipients } : null,
  };
}

/**
 * Quem pode receber o dado do distrair: participantes já escondidos ou encontrados (quem ainda
 * não fez o teste de esconderijo não recebe). O próprio personagem vem primeiro.
 * @param {{id: string, name: string, status: string}[]} participants
 * @param {string} selfId Participante de quem rola.
 */
export function distractRecipients(participants, selfId) {
  const ok = participants.filter((p) => p.status === 'escondido' || p.status === 'encontrado');
  const self = ok.filter((p) => p.id === selfId);
  const others = ok.filter((p) => p.id !== selfId);
  return [...self, ...others].map(({ id, name }) => ({ id, name, self: id === selfId }));
}

/**
 * Dados do teste que podem virar dado de esconderijo: os 3 maiores (com 4 dados rolados, o que
 * ficou de fora não é opção). Os dados anulados pelo pavor continuam valendo aqui.
 */
export function actionEligibleDice(values) {
  return defaultHideKeep(values);
}

/** Dado escolhido por padrão: o de maior valor entre os possíveis. */
export function defaultActionDie(values) {
  const eligible = actionEligibleDice(values);
  return eligible.reduce(
    (best, index) => (values[index] > values[best] ? index : best),
    eligible[0],
  );
}

/** Registro guardado na mensagem do esconder-se ou do distrair (flag `acaoFurtiva`). */
export function createActionFlag({ kind, combatantId, recipientId, dt }) {
  return {
    kind,
    combatantId,
    recipientId: kind === 'distrair' ? recipientId : combatantId,
    dt,
    estado: 'pendente',
    reservadoEm: null,
    dados: null,
    extra: null,
    contado: false,
  };
}

/**
 * O que a barra do cartão da ação mostra.
 * @param {object} flag Registro da ação.
 * @param {{sides: number[], values: number[], success: boolean}} test Dados como estão agora.
 * @param {{canApply: boolean, recipientOk: boolean, now: number}} viewer
 */
export function actionBarView(flag, { values, success }, { canApply, recipientOk, now }) {
  const applied = flag?.estado === 'aplicado';
  return {
    applied,
    success: Boolean(success),
    eligible: actionEligibleDice(values),
    chosen: values.length ? defaultActionDie(values) : null,
    busy: flag?.estado === 'aplicando' && now - (flag.reservadoEm ?? 0) <= HIDE_CLAIM_TIMEOUT_MS,
    recipientOk: Boolean(recipientOk),
    showButton:
      Boolean(canApply) && Boolean(success) && Boolean(recipientOk) && isHideClaimable(flag, now),
  };
}

/** O dado escolhido vale? (precisa estar entre os possíveis) */
export function validActionChoice(values, index) {
  if (index === null || index === undefined || index === '') return false;
  return actionEligibleDice(values).includes(Number(index));
}

// ---------------------------------------------------------------------------------------------
// Chamar atenção e ação chamativa (0.17.7)
// ---------------------------------------------------------------------------------------------

/**
 * Quem pode receber o dado do «chamar atenção»: outro participante já escondido ou encontrado.
 * @param {{id: string, name: string, status: string}[]} participants
 * @param {string} selfId
 */
export function attentionRecipients(participants, selfId) {
  return participants
    .filter((p) => p.id !== selfId && (p.status === 'escondido' || p.status === 'encontrado'))
    .map(({ id, name }) => ({ id, name }));
}

/** Conferência de um dado esperado numa posição da lista (índice e, se informados, lados e valor). */
function matchesAt(list, { index, lados, valor }) {
  const die = list[index];
  if (!die) return false;
  if (lados !== undefined && lados !== null && die.lados !== lados) return false;
  if (valor !== undefined && valor !== null && die.valor !== valor) return false;
  return true;
}

/**
 * Chamar atenção: o personagem passa um dos seus dados para um aliado e descarta mais um (perde
 * dois para o aliado ganhar um). Nunca altera as listas recebidas.
 * @param {{lados: number, valor: number}[]} own Dados de quem chama atenção.
 * @param {{lados: number, valor: number}[]} ally Dados do aliado.
 * @param {{index: number, lados?: number, valor?: number}} transfer Dado que vai para o aliado.
 * @param {{index: number, lados?: number, valor?: number}} discard Dado descartado.
 * @returns {{valid: boolean, own: object[], ally: object[], reason?: string}} `reason`: 'poucos'
 *   (menos de 2 dados), 'mesmo' (o mesmo dado nas duas escolhas), 'mudou' (a lista mudou) ou
 *   'cheio' (o aliado já está no teto de dados).
 */
export function applyAttention(own, ally, transfer, discard) {
  const mine = cleanHideDice(own);
  const theirs = cleanHideDice(ally);
  const fail = (reason) => ({ valid: false, own: mine, ally: theirs, reason });
  if (mine.length < 2) return fail('poucos');
  const t = Number(transfer?.index);
  const d = Number(discard?.index);
  if (!Number.isInteger(t) || !Number.isInteger(d)) return fail('mudou');
  if (t === d) return fail('mesmo');
  const expectT = { index: t, lados: transfer.lados, valor: transfer.valor };
  const expectD = { index: d, lados: discard.lados, valor: discard.valor };
  if (!matchesAt(mine, expectT) || !matchesAt(mine, expectD)) return fail('mudou');
  if (theirs.length >= MAX_HIDE_DICE) return fail('cheio');
  return {
    valid: true,
    own: mine.filter((_, index) => index !== t && index !== d),
    ally: [...theirs, mine[t]],
  };
}

/**
 * Pedido limpo de «chamar atenção» (socket): ids e os dois dados escolhidos (índice, lados,
 * valor). O mestre confere tudo de novo em `applyAttention`.
 */
export function sanitizeAttention(data) {
  const die = (value) => ({
    index: Number(value?.index),
    lados: value?.lados === undefined ? undefined : Number(value.lados),
    valor: value?.valor === undefined ? undefined : Number(value.valor),
  });
  return {
    fromId: String(data?.fromId ?? ''),
    toId: String(data?.toId ?? ''),
    transfer: die(data?.transfer),
    discard: die(data?.discard),
  };
}

/**
 * Ação chamativa na janela pré-teste: os dados que podem ser sacrificados. Só aparece para quem
 * pode ver e mexer nos próprios dados (o jogador dono, ou o mestre com os dados revelados).
 * @returns {{dice: {index: number, lados: number, valor: number}[]}|null}
 */
export function flashyOption({ ativa, canEdit, dice }) {
  const list = cleanHideDice(dice);
  if (!ativa || !canEdit || list.length === 0) return null;
  return { dice: list.map((die, index) => ({ index, ...die })) };
}
