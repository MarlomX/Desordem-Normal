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
 */

/** Faces possíveis dos dados da fechadura. */
export const LOCK_FACES = Object.freeze([4, 6, 8, 10, 12, 20]);

/** Limites da configuração. */
export const MIN_LOCK_DICE = 1;
export const MAX_LOCK_DICE = 10;
export const MAX_LOCK_ATTEMPTS = 99;

/** Padrões de uma fechadura nova: 3d6 e 10 tentativas. */
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

/** Fechadura limpa (configuração estragada volta ao padrão). */
export function normalizeLock(raw) {
  const dados = toInt(raw?.dados);
  const maximo = toInt(raw?.maximo);
  const usadas = toInt(raw?.usadas);
  return {
    dados: dados === null ? DEFAULT_LOCK.dados : clampInt(dados, MIN_LOCK_DICE, MAX_LOCK_DICE),
    faces: LOCK_FACES.includes(toInt(raw?.faces)) ? toInt(raw.faces) : DEFAULT_LOCK.faces,
    maximo: maximo === null ? DEFAULT_LOCK.maximo : clampInt(maximo, 1, MAX_LOCK_ATTEMPTS),
    usadas: usadas === null ? 0 : clampInt(usadas, 0, MAX_LOCK_ATTEMPTS),
    // Verificação automática: o mestre deixa o sistema responder pela senha guardada
    auto: raw?.auto === true,
    senhaMsg: typeof raw?.senhaMsg === 'string' ? raw.senhaMsg : '',
    destrancou: raw?.destrancou === true,
  };
}

/** Situação: 'destrancada', 'estragada' (tentativas esgotadas) ou 'aberta' (ainda dá para tentar). */
export function lockStatus(lock) {
  if (lock.destrancou) return 'destrancada';
  if (lock.usadas >= lock.maximo) return 'estragada';
  return 'aberta';
}

/** Tentativas que ainda restam. */
export const attemptsLeft = (lock) => Math.max(0, lock.maximo - lock.usadas);

/** Os valores formam uma sequência válida para esta fechadura (N números de 1 até as faces)? */
export function validSequence(values, lock) {
  return (
    Array.isArray(values) &&
    values.length === lock.dados &&
    values.every((value) => Number.isInteger(value) && value >= 1 && value <= lock.faces)
  );
}

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
  return { ...lock, usadas: lock.usadas + 1 };
}

/** Marca a fechadura como destrancada. */
export const markUnlocked = (lock) => ({ ...lock, destrancou: true });

/** Guarda o id da mensagem sussurrada com a senha (vazio = sem senha). */
export const setSecretMessage = (lock, id) => ({ ...lock, senhaMsg: String(id ?? '') });

/** Nova fechadura: zera as tentativas, tira o «destrancou» e esquece a senha. */
export const resetLock = (lock) => ({ ...lock, usadas: 0, destrancou: false, senhaMsg: '' });

/**
 * Edita um campo da fechadura (janela do mestre). Mudar a quantidade de dados ou as faces esquece
 * a senha (ela não serve mais). Valor inválido devolve a fechadura sem mudança.
 * @param {string} campo dados, faces, maximo, usadas ou auto.
 */
export function updateLockField(lock, campo, raw) {
  if (campo === 'auto') return typeof raw === 'boolean' ? { ...lock, auto: raw } : lock;
  const value = toInt(raw);
  if (value === null) return lock;
  if (campo === 'dados') {
    const dados = clampInt(value, MIN_LOCK_DICE, MAX_LOCK_DICE);
    return dados === lock.dados ? lock : { ...lock, dados, senhaMsg: '' };
  }
  if (campo === 'faces') {
    if (!LOCK_FACES.includes(value) || value === lock.faces) return lock;
    return { ...lock, faces: value, senhaMsg: '' };
  }
  if (campo === 'maximo') return { ...lock, maximo: clampInt(value, 1, MAX_LOCK_ATTEMPTS) };
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
