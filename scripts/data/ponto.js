/**
 * Modelo de dados da página do Diário «Ponto de interesse» (v0.24.0), subtipo `pontoInteresse`
 * de JournalEntryPage. O formato de cada campo está explicado em `scripts/journal/point.js`; as
 * regras de limpeza (DT, ids, perícias repetidas) também ficam lá, em `normalizeBlocks`.
 */
import { DEFAULT_DT } from '../journal/point.js';

const f = foundry.data.fields;

/** Texto simples (uma linha ou várias), vazio por padrão. */
const texto = () => new f.StringField({ required: true, blank: true, initial: '' });
/** Texto do editor rico (HTML). */
const textoRico = () => new f.HTMLField({ required: true, blank: true, initial: '' });
/** Id estável de bloco ou linha (gerado com `foundry.utils.randomID`). */
const id = (initial) => new f.StringField({ required: true, blank: false, initial });

/** Uma linha do quadro: DT, o texto que o jogador lê e os textos e marcas só do mestre. */
const linha = () =>
  new f.SchemaField({
    id: id('l0'),
    dt: new f.NumberField({ required: true, integer: true, min: 0, max: 99, initial: DEFAULT_DT }),
    texto: textoRico(),
    notaMestre: texto(),
    condicao: texto(),
    // Revelada para todos os jogadores
    revelada: new f.BooleanField({ initial: false }),
    // Revelada só para estes usuários (ids); preenchida pela revelação da 0.24.1
    reveladaPara: new f.ArrayField(new f.StringField({ required: true, blank: false })),
  });

/** Um bloco do quadro: uma ou mais perícias (ou um nome livre) e as linhas delas. */
const bloco = () =>
  new f.SchemaField({
    id: id('b0'),
    // Chaves: `percepcao`, `aptidao`, `aptidao:guerra`, `oficio`, `oficio:metalurgia`…
    pericias: new f.ArrayField(new f.StringField({ required: true, blank: false })),
    rotulo: texto(),
    oculta: new f.BooleanField({ initial: false }),
    linhas: new f.ArrayField(linha()),
  });

export class PontoInteresseModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      numero: texto(),
      // Ponto pai (id de outra página de ponto do mesmo diário; v0.24.6): o número vira pai.N
      paiId: texto(),
      descricaoBasica: textoRico(),
      imagem: new f.FilePathField({
        categories: ['IMAGE'],
        required: false,
        blank: true,
        initial: '',
      }),
      // O mestre pode esconder a imagem dos jogadores (por padrão, eles veem)
      imagemVisivel: new f.BooleanField({ initial: true }),
      blocos: new f.ArrayField(bloco()),
      contexto: textoRico(),
      desafioAcesso: textoRico(),
      // Desafio da guia Desafios ligado ao ponto (v0.24.4); vazio = nenhum
      desafioId: texto(),
    };
  }
}
