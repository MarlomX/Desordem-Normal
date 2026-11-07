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
        contusao: new f.BooleanField({ initial: false })
      }),
      cena: new f.SchemaField({
        testesLesao: new f.NumberField({ required: true, integer: true, min: 0, initial: 0 })
      }),
      lesoes: new f.ArrayField(new f.StringField({ required: true, blank: false }))
    };
  }
}