/**
 * Onde os desafios ficam guardados (Foundry): uma configuração do mundo, pela store comum
 * (`shared/world-store.js`: só o mestre grava, as gravações passam por uma fila e o `onChange`
 * avisa a guia, as janelas e as fichas).
 */
import {
  appendChallenge,
  newChallenge,
  normalizeChallenges,
  removeChallenge,
  replaceChallenge,
  sheetChallenges,
} from '../rolls/challenge.js';
import { createWorldStore } from '../shared/world-store.js';

/** Nome da configuração do mundo que guarda os desafios. */
export const CHALLENGES_SETTING = 'desafios';

const store = createWorldStore({
  key: CHALLENGES_SETTING,
  empty: () => ({ desafios: [] }),
  normalize: normalizeChallenges,
  name: 'desafios',
  the: 'os desafios',
});

/** Avisa quando os desafios mudam (devolve uma função para parar de ouvir). */
export const onChallengesChange = (callback) => store.onChange(callback);

/** Registra a configuração (chamado uma vez, no init). */
export const registerChallengeSetting = () => store.register();

/** Desafios guardados, já limpos (uma configuração estragada vira lista vazia). */
export const readChallenges = () => store.read();

/** Um desafio pelo id (ou `null`). */
export function getChallenge(id) {
  return readChallenges().desafios.find((entry) => entry.id === id) ?? null;
}

/**
 * Muda a lista e grava (só o mestre). `change` recebe a lista atual (relida na hora) e devolve a
 * nova; se devolver a mesma, nada é gravado.
 * @param {(data: {desafios: object[]}) => {desafios: object[]}} change
 */
export const mutateChallenges = (change) => store.mutate(change);

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
