/**
 * Destrancar (lógica pura, sem Foundry). O mestre tem uma «senha»: N dados rolados em segredo, na
 * ordem da rolagem (ou digitados por ele, quando rola com dados físicos). O jogador tenta uma
 * sequência de números; para cada posição, a resposta diz para que lado está o número certo:
 * «alto» (o certo é maior que o tentado), «baixo» (é menor) ou «certo». Ex. da regra: senha 3-5-2,
 * tentativa 4-5-1 → baixo, certo, alto.
 *
 * A fechadura (campo `fechadura` dos desafios do tipo destrancar) guarda só a configuração e o
 * andamento: a senha fica numa mensagem sussurrada ao mestre (o desafio guarda o id dela). As
 * tentativas saem de um total compartilhado entre os participantes; esgotado, a fechadura estraga.
 * Cada posição pode ter um dado diferente (`lados`, ex.: d8 d8 d4 d12). Máximo 0 = tentativas
 * infinitas; o mestre pode esconder o máximo dos jogadores (`mostrarMaximo`).
 */

import { normalizeBoard } from './lock-board.js';

/** Faces possíveis dos dados da fechadura. */
export const LOCK_FACES = Object.freeze([4, 6, 8, 10, 12, 20]);

/** Limites da configuração. */
export const MIN_LOCK_DICE = 1;
export const MAX_LOCK_DICE = 10;
export const MAX_LOCK_ATTEMPTS = 99;

/** Padrões de uma fechadura nova: 3d6 e 10 tentativas (0 = infinitas). */
export const DEFAULT_LOCK = Object.freeze({ dados: 3, faces: 6, maximo: 10 });

/** Respostas de cada posição. */
export const LOCK_ANSWERS = Object.freeze(['alto', 'baixo', 'certo']);

/** Tentativas por rodada conforme o Crime (d4: 1 … d12: 5; d20 paranormal: 6). Só informativo. */
const CRIME_ATTEMPTS = { 4: 1, 6: 2, 8: 3, 10: 4, 12: 5, 20: 6 };

const clampInt = (value, min, max) => Math.min(max, Math.max(min, Math.trunc(value)));

/** Número inteiro de um texto ou número; `null` se vazio ou inválido (vazio não vira 0). */
function toInt(raw) {
  if (typeof raw === 'number') return Number.isInteger(raw) ? raw : null;
  const text = String(raw ?? '').trim();
  return /^-?\d+$/.test(text) ? Number(text) : null;
}

/** Tentativas por rodada para um dado de Crime (`null` se o dado não é conhecido). */
export const crimeAttemptsPerRound = (die) => CRIME_ATTEMPTS[Math.trunc(Number(die))] ?? null;

/** Faces válidas, ou `fallback`. */
const validFaces = (value, fallback) =>
  LOCK_FACES.includes(toInt(value)) ? toInt(value) : fallback;

/**
 * Ajusta a lista de dados ao tamanho pedido: mantém os que já existem e completa com o último
 * (ou com `fallback`, se a lista estiver vazia).
 */
function resizeSides(lados, size, fallback) {
  const list = lados.slice(0, size);
  while (list.length < size) list.push(list[list.length - 1] ?? fallback);
  return list;
}

/** Fechadura limpa (configuração estragada volta ao padrão). */
export function normalizeLock(raw) {
  const dadosRaw = toInt(raw?.dados);
  const dados =
    dadosRaw === null ? DEFAULT_LOCK.dados : clampInt(dadosRaw, MIN_LOCK_DICE, MAX_LOCK_DICE);
  const maximo = toInt(raw?.maximo);
  const usadas = toInt(raw?.usadas);
  // Fechaduras da 0.18.6 têm só `faces` (todos os dados iguais): viram a lista `lados`
  const fallback = validFaces(raw?.faces, DEFAULT_LOCK.faces);
  const listed = Array.isArray(raw?.lados)
    ? raw.lados.map((value) => validFaces(value, fallback))
    : [];
  return {
    dados,
    lados: resizeSides(listed, dados, fallback),
    maximo: maximo === null ? DEFAULT_LOCK.maximo : clampInt(maximo, 0, MAX_LOCK_ATTEMPTS),
    // O máximo de tentativas aparece para os jogadores?
    mostrarMaximo: raw?.mostrarMaximo !== false,
    usadas: usadas === null ? 0 : clampInt(usadas, 0, MAX_LOCK_ATTEMPTS),
    // Verificação automática: o mestre deixa o sistema responder pela senha guardada
    auto: raw?.auto === true,
    senhaMsg: typeof raw?.senhaMsg === 'string' ? raw.senhaMsg : '',
    destrancou: raw?.destrancou === true,
    // Quadro de teoria dos jogadores (veja lock-board.js)
    quadro: normalizeBoard(raw?.quadro, resizeSides(listed, dados, fallback)),
  };
}

/** Tentativas infinitas? (máximo 0) */
export const unlimitedAttempts = (lock) => lock.maximo === 0;

/** Situação: 'destrancada', 'estragada' (tentativas esgotadas) ou 'aberta' (ainda dá para tentar). */
export function lockStatus(lock) {
  if (lock.destrancou) return 'destrancada';
  if (!unlimitedAttempts(lock) && lock.usadas >= lock.maximo) return 'estragada';
  return 'aberta';
}

/** Tentativas que ainda restam (`null` = infinitas). */
export const attemptsLeft = (lock) =>
  unlimitedAttempts(lock) ? null : Math.max(0, lock.maximo - lock.usadas);

/**
 * O máximo aparece para esta pessoa? O mestre sempre; os jogadores, se o mestre deixar. Com
 * tentativas infinitas não há máximo a mostrar.
 */
export const maximumVisible = (lock, { isGM }) =>
  !unlimitedAttempts(lock) && (isGM || lock.mostrarMaximo);

/**
 * Os valores formam uma sequência válida para esta fechadura? Um número por dado, de 1 até as
 * faces daquele dado.
 */
export function validSequence(values, lock) {
  return (
    Array.isArray(values) &&
    values.length === lock.dados &&
    values.every(
      (value, i) => Number.isInteger(value) && value >= 1 && value <= (lock.lados[i] ?? 0),
    )
  );
}

/** Composição resumida: «2d8 + d4 + d12» (agrupa as faces iguais, na ordem em que aparecem). */
export function lockComposition(lock) {
  const counts = new Map();
  for (const sides of lock.lados) counts.set(sides, (counts.get(sides) ?? 0) + 1);
  return [...counts].map(([sides, count]) => `${count > 1 ? count : ''}d${sides}`).join(' + ');
}

/** Fórmula de rolagem que mantém a ordem dos dados (um termo por posição): «1d8 + 1d8 + 1d4». */
export const lockRollFormula = (lock) => lock.lados.map((sides) => `1d${sides}`).join(' + ');

/** Lê uma sequência digitada (campos de texto) — `null` se algum campo for inválido. */
export function parseSequence(raws, lock) {
  if (!Array.isArray(raws)) return null;
  const values = raws.map(toInt);
  return validSequence(values, lock) ? values : null;
}

/**
 * Resposta de cada posição: o número certo é mais alto, mais baixo ou igual ao tentado.
 * `null` se a senha e a tentativa não têm o mesmo tamanho.
 */
export function lockAnswers(secret, guess) {
  if (!Array.isArray(secret) || !Array.isArray(guess) || secret.length !== guess.length) {
    return null;
  }
  return guess.map((value, i) => {
    if (secret[i] > value) return 'alto';
    if (secret[i] < value) return 'baixo';
    return 'certo';
  });
}

/** Todas as posições certas? */
export const allCorrect = (answers) =>
  Array.isArray(answers) && answers.length > 0 && answers.every((answer) => answer === 'certo');

/** Conta uma tentativa (o mestre, ao receber). `null` se a fechadura não está aberta. */
export function registerAttempt(lock) {
  if (lockStatus(lock) !== 'aberta') return null;
  return { ...lock, usadas: Math.min(MAX_LOCK_ATTEMPTS, lock.usadas + 1) };
}

/** Marca a fechadura como destrancada. */
export const markUnlocked = (lock) => ({ ...lock, destrancou: true });

/** Guarda o id da mensagem sussurrada com a senha (vazio = sem senha). */
export const setSecretMessage = (lock, id) => ({ ...lock, senhaMsg: String(id ?? '') });

/** Nova fechadura: zera as tentativas, tira o «destrancou», esquece a senha e limpa o quadro. */
export const resetLock = (lock) => ({
  ...lock,
  usadas: 0,
  destrancou: false,
  senhaMsg: '',
  quadro: [],
});

/**
 * Edita um campo da fechadura (janela do mestre). Mudar a quantidade de dados ou algum dado esquece
 * a senha (ela não serve mais). Valor inválido devolve a fechadura sem mudança.
 * @param {string} campo dados, faces (aplica a todos), lado.N (o dado da posição N, a partir de
 *   0), maximo (0 = infinitas), usadas, auto ou mostrarMaximo.
 */
export function updateLockField(lock, campo, raw) {
  if (campo === 'auto' || campo === 'mostrarMaximo') {
    return typeof raw === 'boolean' ? { ...lock, [campo]: raw } : lock;
  }
  const value = toInt(raw);
  if (value === null) return lock;
  if (campo === 'dados') {
    const dados = clampInt(value, MIN_LOCK_DICE, MAX_LOCK_DICE);
    if (dados === lock.dados) return lock;
    return {
      ...lock,
      dados,
      lados: resizeSides(lock.lados, dados, DEFAULT_LOCK.faces),
      senhaMsg: '',
    };
  }
  if (campo === 'faces') {
    // Aplicar a todos
    if (!LOCK_FACES.includes(value) || lock.lados.every((sides) => sides === value)) return lock;
    return { ...lock, lados: lock.lados.map(() => value), senhaMsg: '' };
  }
  if (campo.startsWith('lado.')) {
    const index = toInt(campo.slice(5));
    if (index === null || index < 0 || index >= lock.dados || !LOCK_FACES.includes(value)) {
      return lock;
    }
    if (lock.lados[index] === value) return lock;
    const lados = [...lock.lados];
    lados[index] = value;
    return { ...lock, lados, senhaMsg: '' };
  }
  if (campo === 'maximo') return { ...lock, maximo: clampInt(value, 0, MAX_LOCK_ATTEMPTS) };
  if (campo === 'usadas') return { ...lock, usadas: clampInt(value, 0, MAX_LOCK_ATTEMPTS) };
  return lock;
}

/**
 * A senha guardada na mensagem sussurrada, se ela ainda vale para esta fechadura (mesmo desafio,
 * mesma quantidade de dados e faces). `null` se não vale.
 * @param {{desafioId: string, valores: number[]}|undefined} flag Flag `senha` da mensagem.
 */
export function secretFromFlag(flag, challengeId, lock) {
  if (!flag || flag.desafioId !== challengeId) return null;
  return validSequence(flag.valores, lock) ? [...flag.valores] : null;
}
