import type { Conexao } from '../../shared/db';
import type { AnoLetivo } from '../dominio/anoLetivo';

type LinhaDeAnoLetivo = {
  id: string;
  rede_id: string;
  ano: number;
  data_inicio: string;
  data_fim: string;
};

const paraAnoLetivo = (linha: LinhaDeAnoLetivo): AnoLetivo => ({
  id: linha.id,
  redeId: linha.rede_id,
  ano: linha.ano,
  dataInicio: linha.data_inicio,
  dataFim: linha.data_fim,
});

/**
 * `ON CONFLICT ... DO NOTHING` devolve zero linhas no lugar de estourar a violação de unicidade
 * (SQLSTATE 23505). O caso de uso lê o booleano e responde com erro de campo; o erro cru
 * abortaria a transação inteira e chegaria à tela como falha do sistema.
 */
export async function inserir(sql: Conexao, anoLetivo: AnoLetivo): Promise<boolean> {
  const criados: { id: string }[] = await sql`
    INSERT INTO ano_letivo (id, rede_id, ano, data_inicio, data_fim)
    VALUES (${anoLetivo.id}, ${anoLetivo.redeId}, ${anoLetivo.ano},
            ${anoLetivo.dataInicio}, ${anoLetivo.dataFim})
    ON CONFLICT ON CONSTRAINT ano_unico_na_rede DO NOTHING
    RETURNING id`;
  return criados.length === 1;
}

export async function porId(sql: Conexao, redeId: string, id: string): Promise<AnoLetivo | null> {
  // `to_char` fixa o formato das colunas `date` em 'AAAA-MM-DD' na consulta, em vez de deixar
  // a conversão para o driver: o texto que a aplicação recebe é o mesmo que ela envia de volta.
  const linhas: LinhaDeAnoLetivo[] = await sql`
    SELECT id, rede_id, ano,
           to_char(data_inicio, 'YYYY-MM-DD') AS data_inicio,
           to_char(data_fim, 'YYYY-MM-DD') AS data_fim
      FROM ano_letivo
     WHERE rede_id = ${redeId} AND id = ${id}`;
  const linha = linhas[0];
  return linha === undefined ? null : paraAnoLetivo(linha);
}

export async function listar(sql: Conexao, redeId: string): Promise<AnoLetivo[]> {
  const linhas: LinhaDeAnoLetivo[] = await sql`
    SELECT id, rede_id, ano,
           to_char(data_inicio, 'YYYY-MM-DD') AS data_inicio,
           to_char(data_fim, 'YYYY-MM-DD') AS data_fim
      FROM ano_letivo
     WHERE rede_id = ${redeId}
     ORDER BY ano DESC`;
  return linhas.map(paraAnoLetivo);
}
