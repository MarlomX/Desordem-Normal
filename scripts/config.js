export const SYSTEM_ID = 'desordem-normal';

export const ATRIBUTOS = ['fisico', 'mente', 'emocao'];

// Perícia -> atributo-base
export const PERICIAS = {
  acrobacia: 'fisico',
  animais: 'emocao',
  atletismo: 'fisico',
  bruxaria: 'mente',
  crime: 'fisico',
  disciplina: 'emocao',
  enganacao: 'emocao',
  furtividade: 'fisico',
  intimidar: 'emocao',
  intuicao: 'emocao',
  inspecionar: 'mente',
  luta: 'fisico',
  medicina: 'mente',
  percepcao: 'mente',
  persuasao: 'emocao',
  pontaria: 'fisico',
  sobrevivencia: 'mente',
  vigor: 'fisico'
};

// Aptidão (atributo-base: mente) possui áreas próprias
export const APTIDOES = ['artes', 'erudicao', 'folclore', 'guerra', 'nobreza', 'religiao'];

// Ofício (atributo-base: mente) também possui áreas próprias; cada uma tem seu dado
export const OFICIOS = ['alquimia', 'carpintaria', 'metalurgia'];
