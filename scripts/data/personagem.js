import { ATRIBUTOS, PERICIAS, APTIDOES } from '../config.js';

export default class PersonagemModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const f = foundry.data.fields;

    // Dados vão de d4 a d12 (d20 só com efeitos paranormais); guardamos o número de faces.
    const dado = (inicial = 4) =>
      new f.NumberField({ required: true, integer: true, min: 4, max: 20, initial: inicial });

    const recurso = () =>
      new f.SchemaField({
        value: new f.NumberField({ required: true, integer: true, min: 0, initial: 10 }),
        max: new f.NumberField({ required: true, integer: true, min: 0, initial: 10 })
      });

    const mapear = (chaves, fabrica) =>
      Object.fromEntries(chaves.map((chave) => [chave, fabrica(chave)]));

    return {
      nivel: new f.NumberField({ required: true, integer: true, min: 1, max: 10, initial: 1 }),
      atributos: new f.SchemaField(mapear(ATRIBUTOS, () => dado(6))),
      pericias: new f.SchemaField(mapear(Object.keys(PERICIAS), () => dado(4))),
      aptidoes: new f.SchemaField(mapear(APTIDOES, () => dado(4))),
      pv: recurso(),
      pd: recurso(),
      // Estado de saúde: condições, lesões permanentes e contador de testes de lesão da cena
      estado: new f.SchemaField({
        inconsciente: new f.BooleanField({ initial: false }),
        moribundo: new f.BooleanField({ initial: false }),
        morto: new f.BooleanField({ initial: false }),
        morteLenta: new f.BooleanField({ initial: false }),
        contusao: new f.BooleanField({ initial: false }),
        // Estado mental: dado de pavor (0 = sem pavor, ou 4 a 12), estupor e colapso total
        pavor: new f.NumberField({ required: true, integer: true, min: 0, max: 12, initial: 0 }),
        estupor: new f.BooleanField({ initial: false }),
        colapso: new f.BooleanField({ initial: false })
      }),
      cena: new f.SchemaField({
        testesLesao: new f.NumberField({ required: true, integer: true, min: 0, initial: 0 }),
        testesTrauma: new f.NumberField({ required: true, integer: true, min: 0, initial: 0 }),
        // Quem já recebeu a cura nesta cena (ids dos aliados) e o animal ferido da cena
        curados: new f.ArrayField(new f.StringField({ required: true, blank: false })),
        animalFerido: new f.BooleanField({ initial: false })
      }),
      // Recursos das habilidades: barra de ímpeto (0 a 5) e marcadores de análise (0 a 4)
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
      // Efeitos temporários: descrição e, se quiser, passos no dado de um atributo
      efeitos: new f.ArrayField(
        new f.SchemaField({
          nome: new f.StringField({ required: true, blank: true, initial: '' }),
          descricao: new f.StringField({ required: true, blank: true, initial: '' }),
          atributo: new f.StringField({ required: true, blank: true, initial: '' }),
          passos: new f.NumberField({ required: true, integer: true, min: -3, max: 3, initial: 0 }),
          fimDeCena: new f.BooleanField({ initial: false })
        })
      )
    };
  }
}