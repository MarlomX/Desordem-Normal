/**
 * Modelos de dados da perseguição (Foundry). O encontro (Combat do tipo `perseguicao`) guarda a
 * configuração e a rodada; cada participante (Combatant do tipo `participante`) guarda a sua
 * situação. Na 0.16.0 só `ativa` e `rodadaAtual` são usados; os campos do participante já
 * existem para as próximas versões (avançar, fôlego e carregar outro).
 */

/** Dados do encontro de perseguição. */
export class PerseguicaoModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const f = foundry.data.fields;
    return {
      // false = em preparação (o mestre monta a lista); true = em andamento
      ativa: new f.BooleanField({ required: true, initial: false }),
      rodadaAtual: new f.NumberField({ required: true, integer: true, min: 0, initial: 0 }),
    };
  }
}

/** Dados de cada participante da perseguição. */
export class ParticipanteModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const f = foundry.data.fields;
    return {
      // Pontos de avanço acumulados (ainda não usado)
      pa: new f.NumberField({ required: true, integer: true, min: 0, initial: 0 }),
      // Dados de fôlego disponíveis (ainda não usado)
      folego: new f.NumberField({ required: true, integer: true, min: 0, initial: 0 }),
      // Id do participante que está carregando este (vazio = ninguém; ainda não usado)
      carregadoPor: new f.StringField({ required: true, blank: true, initial: '' }),
    };
  }
}
