/**
 * Modelos de dados das ameaças (atores controlados pelo mestre). `AmeacaModel` tem o que toda
 * ameaça tem; `CriaturaModel` é o primeiro tipo. Tipos futuros (outras ameaças do playtest)
 * herdam de `AmeacaModel` e acrescentam só o que for deles.
 *
 * Diferente do personagem, uma ameaça não tem PD, pavor, relações, lesões nem traumas. As
 * perícias do livro existem todas (d4 por padrão); no lugar de Aptidão e Ofício há até 10
 * perícias próprias, com nome livre.
 */
import { ATRIBUTOS, PERICIAS, ELEMENTOS } from '../config.js';
import { MAX_RD } from '../rolls/threat.js';

const f = foundry.data.fields;

const texto = () => new f.StringField({ required: true, blank: true, initial: '' });

// Dados vão de d4 a d12 (d20 só com efeitos paranormais); guardamos o número de faces.
const dado = (inicial = 4) =>
  new f.NumberField({ required: true, integer: true, min: 4, max: 20, initial: inicial });

const mapear = (chaves, fabrica) =>
  Object.fromEntries(chaves.map((chave) => [chave, fabrica(chave)]));

/** Base comum das ameaças. */
export class AmeacaModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      atributos: new f.SchemaField(mapear(ATRIBUTOS, () => dado(6))),
      pericias: new f.SchemaField(mapear(Object.keys(PERICIAS), () => dado(4))),
      // Atributo-base escolhido na ficha para cada perícia do livro ('' = padrão)
      atributosPericias: new f.SchemaField(mapear(Object.keys(PERICIAS), () => texto())),
      // Perícias próprias (mesmo formato das áreas extras do personagem; grupo `pericia`)
      periciasExtras: new f.ArrayField(
        new f.SchemaField({
          id: new f.StringField({ required: true, blank: false }),
          nome: texto(),
          dado: dado(4),
          atributo: texto(),
        }),
      ),
      pv: new f.SchemaField({
        value: new f.NumberField({ required: true, integer: true, min: 0, initial: 10 }),
        max: new f.NumberField({ required: true, integer: true, min: 0, initial: 10 }),
      }),
      // Redução de dano: descontada de cada dano físico antes de diminuir o PV
      rd: new f.NumberField({ required: true, integer: true, min: 0, max: MAX_RD, initial: 0 }),
      // Comportamento padrão (texto livre do mestre) e descrição física
      estrategia: texto(),
      descricao: texto(),
      // Passos temporários e efeitos: mesmo formato do personagem (caído, atordoado, ajuda...)
      passos: new f.SchemaField({
        fisico: new f.NumberField({ required: true, integer: true, min: -4, max: 4, initial: 0 }),
        mente: new f.NumberField({ required: true, integer: true, min: -4, max: 4, initial: 0 }),
        emocao: new f.NumberField({ required: true, integer: true, min: -4, max: 4, initial: 0 }),
        pericias: new f.NumberField({ required: true, integer: true, min: -4, max: 4, initial: 0 }),
      }),
      efeitos: new f.ArrayField(
        new f.SchemaField({
          nome: texto(),
          descricao: texto(),
          atributo: texto(),
          passos: new f.NumberField({ required: true, integer: true, min: -3, max: 3, initial: 0 }),
          fimDeCena: new f.BooleanField({ initial: false }),
        }),
      ),
    };
  }
}

/** Criatura: ameaça paranormal com um elemento principal e, se quiser, secundários. */
export class CriaturaModel extends AmeacaModel {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      elementos: new f.SchemaField({
        principal: new f.StringField({
          required: true,
          blank: true,
          initial: '',
          choices: ['', ...ELEMENTOS],
        }),
        secundarios: new f.ArrayField(
          new f.StringField({ required: true, blank: false, choices: ELEMENTOS }),
        ),
      }),
    };
  }
}
