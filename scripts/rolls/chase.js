/**
 * Perseguição: lógica pura (sem dependência do Foundry).
 *
 * Nesta versão (esqueleto) só existe o ciclo de vida da perseguição e as regras de quem pode
 * ver e abrir a janela. Avançar, fôlego e consequências chegam nas próximas versões 0.16.x.
 *
 * Ciclo de vida:  preparação (ativa: false, rodada 0) --iniciar--> em andamento (ativa: true,
 * rodada 1) --encerrar--> volta à preparação. Só pode existir uma perseguição por vez.
 */

/** Subtipo do encontro (Combat) e do participante (Combatant) registrados no system.json. */
export const CHASE_COMBAT_TYPE = 'perseguicao';
export const CHASE_COMBATANT_TYPE = 'participante';

/** Estado de uma perseguição recém-criada: em preparação, sem rodada. */
export function initialChaseState() {
  return { ativa: false, rodadaAtual: 0 };
}

/** Estado ao iniciar a perseguição: ativa, na rodada 1. */
export function startState() {
  return { ativa: true, rodadaAtual: 1 };
}

/** Estado ao encerrar a perseguição: volta à preparação. */
export function endState() {
  return { ativa: false, rodadaAtual: 0 };
}

/**
 * Atores que ainda podem ser adicionados: remove os que já participam e ordena pelo nome.
 * @param {{id: string, name: string}[]} candidates
 * @param {string[]} currentActorIds Ids dos atores que já participam.
 * @returns {{id: string, name: string}[]}
 */
export function addableActors(candidates, currentActorIds) {
  const taken = new Set(currentActorIds);
  return candidates
    .filter((actor) => !taken.has(actor.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

/**
 * Quem pode fazer o quê com a perseguição.
 * - O mestre cria (se não existir) e administra (se existir) e sempre pode abrir a janela.
 * - O jogador só abre a janela se a perseguição estiver em andamento e ele tiver um personagem
 *   participando.
 * - O cartão da ficha aparece para o personagem que participa: para o jogador só em andamento,
 *   para o mestre também durante a preparação.
 * @param {{isGM: boolean, chase: {ativa: boolean}|null, isParticipant: boolean}} params
 *   `isParticipant`: o jogador tem um personagem na perseguição (para `canOpen`) ou o personagem
 *   da ficha está nela (para `showCard`).
 * @returns {{canCreate: boolean, canManage: boolean, canOpen: boolean, showCard: boolean}}
 */
export function chaseAccess({ isGM, chase, isParticipant }) {
  const exists = Boolean(chase);
  return {
    canCreate: isGM && !exists,
    canManage: isGM && exists,
    canOpen: exists && (isGM || (chase.ativa && isParticipant)),
    showCard: exists && isParticipant && (chase.ativa || isGM),
  };
}

/** Botão da aba de combate: `criar` (mestre, sem perseguição), `abrir` ou nenhum (`null`). */
export function trackerAction(access) {
  if (access.canCreate) return 'criar';
  if (access.canOpen) return 'abrir';
  return null;
}

/**
 * A janela deve abrir sozinha neste cliente?
 * - `created`: o mestre que criou a perseguição.
 * - `started`: os donos de participantes (não mestres) e o mestre que iniciou.
 * - `joined`: o dono de um personagem adicionado com a perseguição já em andamento.
 * @param {'created'|'started'|'joined'} event
 * @param {{isGM: boolean, isAuthor: boolean, ownsParticipant: boolean}} who
 */
export function shouldAutoOpen(event, { isGM, isAuthor, ownsParticipant }) {
  if (event === 'created') return isGM && isAuthor;
  if (event === 'started') return isGM ? isAuthor : ownsParticipant;
  if (event === 'joined') return !isGM && ownsParticipant;
  return false;
}
