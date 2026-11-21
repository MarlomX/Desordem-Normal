import { ATRIBUTOS, PERICIAS, APTIDOES, OFICIOS } from '../config.js';
import { migrateCraftSkill, migrateAbilityResources } from './migrations.js';
import { OVERRIDABLE_KEYS } from '../rolls/attribute.js';

export default class PersonagemModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const f = foundry.data.fields;

    // Mapa chave → valor, com o tipo do valor conferido (TypedObjectField existe no v12+; se
    // faltar, um ObjectField comum guarda o mesmo mapa sem conferir)
    const objetoDe = (element) =>
      f.TypedObjectField ? new f.TypedObjectField(element) : new f.ObjectField();

    // Dados vão de d4 a d12 (d20 só com efeitos paranormais); guardamos o número de faces.
    const dado = (inicial = 4) =>
      new f.NumberField({ required: true, integer: true, min: 4, max: 20, initial: inicial });

    const recurso = () =>
      new f.SchemaField({
        value: new f.NumberField({ required: true, integer: true, min: 0, initial: 10 }),
        max: new f.NumberField({ required: true, integer: true, min: 0, initial: 10 })
      });

    // Áreas extras de Aptidão e Ofício criadas pelo jogador (além das do livro)
    const extras = () =>
      new f.ArrayField(
        new f.SchemaField({
          id: new f.StringField({ required: true, blank: false }),
          nome: new f.StringField({ required: true, blank: true, initial: '' }),
          dado: dado(4),
          // Atributo-base escolhido na ficha ('' = padrão, Mente)
          atributo: new f.StringField({ required: true, blank: true, initial: '' })
        })
      );

    const mapear = (chaves, fabrica) =>
      Object.fromEntries(chaves.map((chave) => [chave, fabrica(chave)]));

    return {
      nivel: new f.NumberField({ required: true, integer: true, min: 1, max: 10, initial: 1 }),
      // Textos livres do cabeçalho da ficha
      perfil: new f.StringField({ required: true, blank: true, initial: '' }),
      vocacao: new f.StringField({ required: true, blank: true, initial: '' }),
      atributos: new f.SchemaField(mapear(ATRIBUTOS, () => dado(6))),
      pericias: new f.SchemaField(mapear(Object.keys(PERICIAS), () => dado(4))),
      aptidoes: new f.SchemaField(mapear(APTIDOES, () => dado(4))),
      oficios: new f.SchemaField(mapear(OFICIOS, () => dado(4))),
      // Atributo-base escolhido na ficha para cada perícia, aptidão e ofício do livro ('' = padrão)
      atributosPericias: new f.SchemaField(
        mapear(OVERRIDABLE_KEYS, () => new f.StringField({ required: true, blank: true, initial: '' }))
      ),
      aptidoesExtras: extras(),
      oficiosExtras: extras(),
      pv: recurso(),
      pd: recurso(),
      // Estado de saúde: condições, lesões permanentes e contador de testes de lesão da cena
      estado: new f.SchemaField({
        inconsciente: new f.BooleanField({ initial: false }),
        moribundo: new f.BooleanField({ initial: false }),
        morto: new f.BooleanField({ initial: false }),
        morteLenta: new f.BooleanField({ initial: false }),
        contusao: new f.BooleanField({ initial: false }),
        // Estado mental: dado de pavor (0 = sem pavor, ou 4 a 20), estupor e colapso total
        pavor: new f.NumberField({ required: true, integer: true, min: 0, max: 20, initial: 0 }),
        estupor: new f.BooleanField({ initial: false }),
        colapso: new f.BooleanField({ initial: false })
      }),
      cena: new f.SchemaField({
        testesLesao: new f.NumberField({ required: true, integer: true, min: 0, initial: 0 }),
        testesTrauma: new f.NumberField({ required: true, integer: true, min: 0, initial: 0 }),
        // Primeiros socorros RECEBIDOS nesta cena (cada um sobe +3 a DT do próximo neste paciente)
        primeirosSocorros: new f.NumberField({ required: true, integer: true, min: 0, initial: 0 }),
        // Quem já recebeu a cura nesta cena (ids dos aliados) e o animal ferido da cena
        curados: new f.ArrayField(new f.StringField({ required: true, blank: false })),
        animalFerido: new f.BooleanField({ initial: false }),
        // Já atacou nesta cena (efeito `passoAtaque` do «primeiro ataque da cena»); zera na Nova
        // cena e no início do combate
        atacou: new f.BooleanField({ initial: false })
      }),
      // Proficiência marcial marcada à mão (também pode vir de uma habilidade, pelo efeito
      // `proficienciaMarcial`). Sem ela, a ficha não deixa empunhar armas marciais.
      proficienciaMarcial: new f.BooleanField({ initial: false }),
      // Recursos das habilidades (v0.20.0): valor atual de cada recurso, pela chave do efeito
      // `recurso` (ex.: { impeto: 2, analise: 0 }). O máximo vem do efeito, não daqui.
      recursosHab: objetoDe(
        new f.NumberField({ required: true, integer: true, min: 0, max: 20, initial: 0 })
      ),
      // Último uso, por efeito, das habilidades limitadas a uma vez por rodada de combate
      // (chave `itemId-efeitoId`; vale enquanto o combate e a rodada forem os mesmos)
      usosRodada: objetoDe(
        new f.SchemaField({
          combate: new f.StringField({ required: true, blank: true, initial: '' }),
          rodada: new f.NumberField({ required: true, integer: true, min: 0, initial: 0 })
        })
      ),
      // Reserva de dados bônus recebidos (ex.: plano de ação): o tamanho de cada dado. Esvazia na
      // Nova cena; o gasto na janela pré-teste chega na v0.20.5
      dadosBonus: new f.ArrayField(
        new f.NumberField({ required: true, integer: true, min: 4, max: 12, initial: 6 })
      ),
      // Campos antigos (até a v0.19.x), só lidos pela migração para `recursosHab`
      recursos: new f.SchemaField({
        impeto: new f.NumberField({ required: true, integer: true, min: 0, max: 5, initial: 0 }),
        analise: new f.NumberField({ required: true, integer: true, min: 0, max: 4, initial: 0 })
      }),
      // Habilidades ativadas para o próximo teste (ex.: dado extra de ímpeto)
      ativas: new f.ArrayField(new f.StringField({ required: true, blank: false })),
      lesoes: new f.ArrayField(new f.StringField({ required: true, blank: false })),
      traumas: new f.ArrayField(new f.StringField({ required: true, blank: false })),
      // Relações: grau 0 a 3 (as bolinhas), descrição narrativa e marcador "usada"
      relacoes: new f.ArrayField(
        new f.SchemaField({
          pessoa: new f.StringField({ required: true, blank: true, initial: '' }),
          grau: new f.NumberField({ required: true, integer: true, min: 0, max: 3, initial: 1 }),
          descricao: new f.StringField({ required: true, blank: true, initial: '' }),
          usada: new f.BooleanField({ initial: false })
        })
      ),
      // Passos temporários ajustados à mão (por exemplo, ajuda de um aliado): um por atributo e um
      // geral para o dado das perícias. Zeram no reinício de cena.
      passos: new f.SchemaField({
        fisico: new f.NumberField({ required: true, integer: true, min: -4, max: 4, initial: 0 }),
        mente: new f.NumberField({ required: true, integer: true, min: -4, max: 4, initial: 0 }),
        emocao: new f.NumberField({ required: true, integer: true, min: -4, max: 4, initial: 0 }),
        pericias: new f.NumberField({ required: true, integer: true, min: -4, max: 4, initial: 0 })
      }),
      // Efeitos temporários: descrição e, se quiser, passos no dado de um atributo (ou de todos,
      // 'todos'). `origem` marca os criados por uma habilidade (passo condicional)
      efeitos: new f.ArrayField(
        new f.SchemaField({
          nome: new f.StringField({ required: true, blank: true, initial: '' }),
          descricao: new f.StringField({ required: true, blank: true, initial: '' }),
          atributo: new f.StringField({ required: true, blank: true, initial: '' }),
          passos: new f.NumberField({ required: true, integer: true, min: -3, max: 3, initial: 0 }),
          fimDeCena: new f.BooleanField({ initial: false }),
          origem: new f.StringField({ required: true, blank: true, initial: '' })
        })
      )
    };
  }

  /**
   * Adapta dados salvos por versões anteriores antes de o Foundry validá-los.
   * Até a v0.14.4 existia a perícia `metalurgia`; hoje ela é uma área do Ofício. Até a v0.19.x
   * o ímpeto e a análise ficavam em `recursos`; hoje ficam em `recursosHab`.
   */
  static migrateData(source) {
    migrateCraftSkill(source);
    migrateAbilityResources(source);
    return super.migrateData(source);
  }
}
