/**
 * Modelos de dados dos Items: armas, armaduras e itens em geral.
 */
import { AUTOMATIONS } from '../rolls/abilities.js';

const f = foundry.data.fields;

const texto = () => new f.StringField({ required: true, blank: true, initial: '' });
const contagem = (inicial) =>
  new f.NumberField({ required: true, integer: true, min: 0, initial: inicial });

/** Arma: corpo a corpo ou à distância, de uma ou duas mãos; dano = RA + modificador. */
export class ArmaModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      descricao: texto(),
      tipo: new f.StringField({
        required: true,
        choices: ['corpo', 'distancia'],
        initial: 'corpo',
      }),
      maos: new f.NumberField({ required: true, integer: true, min: 1, max: 2, initial: 1 }),
      bonusDano: new f.NumberField({
        required: true,
        integer: true,
        min: -10,
        max: 20,
        initial: 0,
      }),
      // Perícia do ataque; vazio = Luta (corpo a corpo) ou Pontaria (à distância)
      pericia: texto(),
      naoLetal: new f.BooleanField({ initial: false }),
      empunhada: new f.BooleanField({ initial: false }),
    };
  }
}

/**
 * Armadura: cada ponto gasto reduz em 10 o dano físico sofrido (não se recupera no playtest).
 * Só uma armadura pode ser vestida por vez.
 */
export class ArmaduraModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      descricao: texto(),
      pontos: contagem(1),
      restantes: contagem(1),
      vestida: new f.BooleanField({ initial: false }),
    };
  }

  /** Itens da v0.10.0 guardavam os pontos gastos; agora guardamos os pontos restantes. */
  static migrateData(source) {
    if (source.restantes === undefined && source.gastos !== undefined) {
      source.restantes = Math.max(0, (source.pontos ?? 1) - source.gastos);
    }
    return super.migrateData(source);
  }
}

/**
 * Item em geral, com quantidade e, se quiser, limite de usos ou consumo por uso. Pode ser
 * empunhado (ocupa uma ou duas mãos), mas muitos itens podem ser usados sem empunhar.
 */
export class ItemModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      descricao: texto(),
      quantidade: contagem(1),
      consumivel: new f.BooleanField({ initial: false }),
      maos: new f.NumberField({ required: true, integer: true, min: 1, max: 2, initial: 1 }),
      empunhada: new f.BooleanField({ initial: false }),
      // Limite de usos: 0 = sem limite; senão, máximo e restantes
      usosMax: contagem(0),
      usos: contagem(0),
    };
  }
}

/**
 * Habilidade. Não separamos as que vêm da origem das que vêm de nível: todas são iguais, e a de
 * perfil (`perfil`) aparece sempre primeiro. `automacao` liga a habilidade a um comportamento do
 * sistema; vazio = só descrição.
 */
export class HabilidadeModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      descricao: texto(),
      perfil: new f.BooleanField({ initial: false }),
      automacao: new f.StringField({ required: true, blank: true, initial: '' }),
    };
  }

  static get automations() {
    return AUTOMATIONS;
  }
}
