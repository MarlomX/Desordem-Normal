/**
 * Modelos de dados dos Items: armas, armaduras e itens em geral.
 */
import { AUTOMATIONS } from '../rolls/abilities.js';
import { GRIPS, WEAPON_CATEGORIES } from '../rolls/equipment.js';
import { migrateGearSource, migrateWeaponSource } from './migrations.js';

const f = foundry.data.fields;

const texto = () => new f.StringField({ required: true, blank: true, initial: '' });
const contagem = (inicial) =>
  new f.NumberField({ required: true, integer: true, min: 0, initial: inicial });

/**
 * Lista de efeitos (mesmo formato nas habilidades e nos equipamentos): cada efeito tem um `id`,
 * um `tipo` do catálogo (rolls/ability-effects.js) e os parâmetros (`params`), que ficam livres
 * no banco e são limpos por `normalizeEffect` sempre que o sistema lê.
 */
const efeitos = () =>
  new f.ArrayField(
    new f.SchemaField({
      id: new f.StringField({ required: true, blank: false, initial: 'e0' }),
      tipo: new f.StringField({ required: true, blank: false, initial: 'acaoNota' }),
      params: new f.ObjectField(),
    }),
  );

/** Empunhadura: uma ou duas mãos (`GRIPS`). */
const empunhadura = () => new f.StringField({ required: true, choices: GRIPS, initial: 'uma' });

/**
 * Arma: corpo a corpo ou à distância, de uma ou duas mãos; dano = RA (ou RB) + modificador.
 * Categoria natural (garras, mordida, soco), simples ou marcial; a natural não ocupa mãos nem
 * precisa ser empunhada. Os ataques das criaturas também são armas (normalmente naturais). Os
 * efeitos da arma só valem nos ataques com ela.
 */
export class ArmaModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      descricao: texto(),
      tipo: new f.StringField({
        required: true,
        choices: ['corpo', 'distancia'],
        initial: 'corpo',
      }),
      categoria: new f.StringField({
        required: true,
        choices: WEAPON_CATEGORIES,
        initial: 'simples',
      }),
      empunhadura: empunhadura(),
      bonusDano: new f.NumberField({
        required: true,
        integer: true,
        min: -10,
        max: 20,
        initial: 0,
      }),
      // Base do dano: rolagem alta (RA, o normal) ou rolagem baixa (RB, como o desarmado)
      baseDano: new f.StringField({ required: true, choices: ['ra', 'rb'], initial: 'ra' }),
      // Perícia do ataque; vazio = Luta (corpo a corpo) ou Pontaria (à distância)
      pericia: texto(),
      naoLetal: new f.BooleanField({ initial: false }),
      empunhada: new f.BooleanField({ initial: false }),
      efeitos: efeitos(),
    };
  }

  /** Até a v0.20.x: `natural` e `maos` (veja `migrateWeaponSource`). */
  static migrateData(source) {
    migrateWeaponSource(source);
    return super.migrateData(source);
  }
}

/**
 * Armadura: cada ponto gasto reduz em 10 o dano físico sofrido (não se recupera no playtest).
 * Só uma armadura pode ser vestida por vez; os efeitos dela só valem enquanto vestida.
 */
export class ArmaduraModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      descricao: texto(),
      pontos: contagem(1),
      restantes: contagem(1),
      vestida: new f.BooleanField({ initial: false }),
      efeitos: efeitos(),
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
 * empunhado (ocupa uma ou duas mãos), mas muitos itens podem ser usados sem empunhar. Os efeitos
 * valem com o item na mochila (basta estar na ficha).
 */
export class ItemModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      descricao: texto(),
      quantidade: contagem(1),
      consumivel: new f.BooleanField({ initial: false }),
      empunhadura: empunhadura(),
      empunhada: new f.BooleanField({ initial: false }),
      // Limite de usos: 0 = sem limite; senão, máximo e restantes
      usosMax: contagem(0),
      usos: contagem(0),
      efeitos: efeitos(),
    };
  }

  /** Até a v0.20.x: `maos` (veja `migrateGearSource`). */
  static migrateData(source) {
    migrateGearSource(source);
    return super.migrateData(source);
  }
}

/**
 * Habilidade. Não separamos as que vêm da origem das que vêm de nível: todas são iguais, e a de
 * perfil (`perfil`) aparece sempre primeiro. `efeitos` é a lista de efeitos da habilidade (tipos
 * do catálogo em rolls/ability-effects.js); `params` fica livre no banco e é limpo por `normalizeEffect`
 * sempre que o sistema lê. `automacao` é o campo antigo (até a 0.19.x): com a lista vazia, os
 * efeitos equivalentes à automação são montados na hora (`itemEffects`). Vazio nos dois = só
 * descrição.
 */
export class HabilidadeModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      descricao: texto(),
      perfil: new f.BooleanField({ initial: false }),
      automacao: new f.StringField({ required: true, blank: true, initial: '' }),
      efeitos: efeitos(),
    };
  }

  static get automations() {
    return AUTOMATIONS;
  }
}
