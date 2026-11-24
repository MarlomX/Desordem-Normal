/**
 * Onde os desafios ficam guardados (Foundry): uma configuração do mundo (`game.settings`, escopo
 * "world", fora do menu de configurações). Todo cliente conectado lê a lista; só o mestre grava.
 * Quando o mestre grava, o Foundry manda o valor novo a todos e chama o `onChange` em cada
 * cliente: é ele que redesenha a guia, as janelas e as fichas.
 *
 * As gravações passam por uma fila (uma de cada vez, sempre relendo o valor atual), para dois
 * cliques seguidos não se sobreporem e um apagar o que o outro gravou.
 */
import { SYSTEM_ID } from '../config.js';
import {
  appendChallenge,
  newChallenge,
  normalizeChallenges,
  removeChallenge,
  replaceChallenge,
  sheetChallenges,
} from '../rolls/challenge.js';

/** Nome da configuração do mundo que guarda os desafios. */
export const CHALLENGES_SETTING = 'desafios';

/** Quem precisa redesenhar quando os desafios mudam (guia, janelas, fichas). */
const listeners = new Set();

/** Avisa quando os desafios mudam (devolve uma função para parar de ouvir). */
export function onChallengesChange(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

/** Registra a configuração (chamado uma vez, no init). */
export function registerChallengeSetting() {
  game.settings.register(SYSTEM_ID, CHALLENGES_SETTING, {
    scope: 'world',
    config: false,
    type: Object,
    default: { desafios: [] },
    onChange: () => {
      for (const callback of listeners) {
        try {
          callback();
        } catch (error) {
          console.error(`${SYSTEM_ID} | falha ao redesenhar os desafios`, error);
        }
      }
    },
  });
}

/** Desafios guardados, já limpos (uma configuração estragada vira lista vazia). */
export function readChallenges() {
  try {
    return normalizeChallenges(game.settings.get(SYSTEM_ID, CHALLENGES_SETTING));
  } catch (error) {
    console.warn(`${SYSTEM_ID} | desafios ilegíveis`, error);
    return { desafios: [] };
  }
}

/** Um desafio pelo id (ou `null`). */
export function getChallenge(id) {
  return readChallenges().desafios.find((entry) => entry.id === id) ?? null;
}

/** Fila das gravações do mestre (cada uma espera a anterior terminar). */
let queue = Promise.resolve();

/**
 * Muda a lista e grava (só o mestre). `change` recebe a lista atual (relida na hora) e devolve a
 * nova; se devolver a mesma, nada é gravado.
 * @param {(data: {desafios: object[]}) => {desafios: object[]}} change
 */
export function mutateChallenges(change) {
  if (!game.user.isGM) return Promise.resolve();
  queue = queue
    .then(async () => {
      const data = readChallenges();
      const next = change(data);
      if (!next || next === data) return;
      await game.settings.set(SYSTEM_ID, CHALLENGES_SETTING, normalizeChallenges(next));
    })
    .catch((error) => console.error(`${SYSTEM_ID} | falha ao gravar os desafios`, error));
  return queue;
}

/** Muda um desafio só (pelo id). `change` recebe o desafio e devolve a versão nova. */
export function mutateChallenge(id, change) {
  return mutateChallenges((data) => {
    const challenge = data.desafios.find((entry) => entry.id === id);
    if (!challenge) return data;
    const next = change(challenge);
    return next === challenge ? data : replaceChallenge(data, next);
  });
}

/** Cria um desafio (teste estendido, arrombar ou escalar) com os padrões e devolve o id dele. */
export async function createChallenge(nome, tipo = 'estendido') {
  const id = foundry.utils.randomID();
  await mutateChallenges((data) => appendChallenge(data, newChallenge(id, nome, tipo)));
  return getChallenge(id) ? id : null;
}

/** Apaga um desafio. */
export function deleteChallenge(id) {
  return mutateChallenges((data) => removeChallenge(data, id));
}

/** Id do ator do mundo por trás de uma ficha (a ficha de um token aponta para o ator base). */
export const worldActorId = (actor) => (actor?.isToken ? actor.baseActor?.id : actor?.id) ?? '';

/** Nome e imagem de um ator do mundo, ou `null` se ele não existe mais. */
export function actorInfo(id) {
  const actor = game.actors.get(id);
  return actor ? { name: actor.name, img: actor.img } : null;
}

/**
 * Dados do cartão de desafios da ficha: os desafios ativos de que o personagem participa, ou
 * `null` se não houver nenhum (o cartão fica escondido).
 */
export function challengeCardFor(actor) {
  const list = sheetChallenges(readChallenges(), worldActorId(actor), {
    isGM: game.user.isGM,
  }).map((entry) => ({
    ...entry,
    // Chave montada (conferida à mão): DESORDEM.Desafio.Unidade.{tipo, descer, descerOculto}
    unidade: game.i18n.localize(`DESORDEM.Desafio.Unidade.${entry.unidadeChave}`),
  }));
  return list.length ? { lista: list, isGM: game.user.isGM } : null;
}
