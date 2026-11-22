/**
 * Campo do modelo de dados para os efeitos da aba Condição (`system.efeitos`), igual no personagem
 * e na criatura. O formato e a lógica estão em rolls/effects.js; aqui só fica o esquema que o
 * Foundry confere ao gravar.
 */
import { DURATIONS } from '../rolls/effects.js';

/**
 * Lista de efeitos da aba Condição. Cada efeito tem:
 * - `id`: identificador (vazio nos antigos até a primeira gravação; a lógica usa `ef0`, `ef1`...);
 * - `nome`, `descricao`: textos livres;
 * - `chave`: de onde o efeito pronto veio (compêndio ou tabela; vazio = feito à mão);
 * - `origem`: quem o criou (habilidade, item, falha crítica; vazio = à mão);
 * - `duracao`: `cena`, `permanente` ou `manual`;
 * - `efeitos`: lista do catálogo (`{id, tipo, params}`), com os parâmetros livres no banco e
 *   limpos por `normalizeEffect` sempre que o sistema lê (o mesmo das habilidades).
 * Chamada só dentro de `defineSchema` (quando `foundry.data.fields` já existe).
 */
export function conditionEffectsField() {
  const f = foundry.data.fields;
  const texto = () => new f.StringField({ required: true, blank: true, initial: '' });
  return new f.ArrayField(
    new f.SchemaField({
      id: texto(),
      nome: texto(),
      descricao: texto(),
      chave: texto(),
      origem: texto(),
      duracao: new f.StringField({ required: true, choices: DURATIONS, initial: 'manual' }),
      efeitos: new f.ArrayField(
        new f.SchemaField({
          id: new f.StringField({ required: true, blank: false, initial: 'e0' }),
          tipo: new f.StringField({ required: true, blank: false, initial: 'passo' }),
          params: new f.ObjectField(),
        }),
      ),
    }),
  );
}
