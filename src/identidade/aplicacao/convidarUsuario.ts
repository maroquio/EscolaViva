import { z } from 'zod';
import { unidadeDeTrabalho } from '../../shared/db';
import { idGeneratorUuid } from '../../shared/ports';
import { errosDeSchema, falha, falhaDeCampo, sucesso, type Resultado } from '../../shared/resultado';
import { PAPEIS, type Papel } from '../dominio/papel';
import { emailNormalizado, type Usuario } from '../dominio/usuario';
import * as unidadeRepositorio from '../infra/unidadeRepositorio';
import * as usuarioRepositorio from '../infra/usuarioRepositorio';

const schema = z.object({
  redeId: z.string().uuid('rede inválida'),
  nome: z.string().trim().min(1, 'informe o nome').max(120, 'nome longo demais'),
  email: z.string().trim().min(1, 'informe o e-mail').email('e-mail inválido'),
  atribuicoes: z
    .array(
      z.object({
        unidadeId: z.string().uuid('unidade inválida'),
        papel: z.enum(PAPEIS, { errorMap: () => ({ message: 'papel desconhecido' }) }),
      }),
    )
    .min(1, 'escolha ao menos uma unidade e um papel'),
  responsavelId: z.string().uuid('responsável inválido').nullable().optional(),
});

// Sem I, O, 0 e 1: a senha provisória é ditada por telefone e digitada de novo por quem recebe.
const ALFABETO_SEM_AMBIGUIDADE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TAMANHO_DA_SENHA_PROVISORIA = 12;

function senhaProvisoria(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(TAMANHO_DA_SENHA_PROVISORIA));
  // O alfabeto tem 32 símbolos e 256 é múltiplo de 32: o resto não distorce o sorteio.
  return Array.from(bytes, (byte) =>
    ALFABETO_SEM_AMBIGUIDADE.charAt(byte % ALFABETO_SEM_AMBIGUIDADE.length),
  ).join('');
}

type Atribuicao = { unidadeId: string; papel: Papel };

/** O formulário pode repetir o par unidade+papel; a chave primária de `papel_usuario` não pode. */
function atribuicoesDistintas(atribuicoes: Atribuicao[]): Atribuicao[] {
  const porChave = new Map<string, Atribuicao>();
  for (const atribuicao of atribuicoes) {
    porChave.set(`${atribuicao.unidadeId}:${atribuicao.papel}`, atribuicao);
  }
  return [...porChave.values()];
}

type ConviteAceito = { usuarioId: string; senhaProvisoria: string };

type Convite = {
  usuario: Usuario;
  senhaHash: string;
  senhaProvisoria: string;
  atribuicoes: Atribuicao[];
};

/**
 * Usuário e papéis nascem na MESMA unidade de trabalho: um convite que criasse a pessoa e
 * falhasse ao dar o papel deixaria alguém logando sem enxergar tela nenhuma.
 */
async function gravar(convite: Convite): Promise<Resultado<ConviteAceito>> {
  const { usuario, atribuicoes } = convite;
  return await unidadeDeTrabalho(async ({ sql }) => {
    const unidadesPedidas = atribuicoes.map((atribuicao) => atribuicao.unidadeId);
    const unidadesDaRede = await unidadeRepositorio.idsNaRede(sql, usuario.redeId, unidadesPedidas);
    if (unidadesPedidas.some((id) => !unidadesDaRede.has(id))) {
      return falhaDeCampo(
        'atribuicoes',
        'unidade_de_outra_rede',
        'unidade não pertence a esta rede',
      );
    }
    if (await usuarioRepositorio.existeEmail(sql, usuario.redeId, usuario.email)) {
      return falhaDeCampo('email', 'email_em_uso', 'já existe usuário com este e-mail na rede');
    }

    await usuarioRepositorio.inserir(sql, usuario, convite.senhaHash);
    await usuarioRepositorio.inserirPapeis(sql, usuario.redeId, usuario.id, atribuicoes);
    // A senha provisória volta para ser mostrada uma vez a quem convidou: não há envio de
    // e-mail no Estágio 01 e ela nunca aparece em log.
    return sucesso({ usuarioId: usuario.id, senhaProvisoria: convite.senhaProvisoria });
  });
}

export async function convidarUsuario(entrada: {
  redeId: string;
  nome: string;
  email: string;
  atribuicoes: Atribuicao[];
  responsavelId?: string | null | undefined;
}): Promise<Resultado<ConviteAceito>> {
  const analise = schema.safeParse(entrada);
  if (!analise.success) return falha(...errosDeSchema(analise.error.issues));
  const dados = analise.data;

  const atribuicoes = atribuicoesDistintas(dados.atribuicoes);
  const responsavelId = dados.responsavelId ?? null;
  const entraComoResponsavel = atribuicoes.some(({ papel }) => papel === 'responsavel');
  if (entraComoResponsavel && responsavelId === null) {
    return falhaDeCampo(
      'responsavelId',
      'responsavel_obrigatorio',
      'quem entra como responsável precisa estar ligado a um cadastro de responsável',
    );
  }

  const senha = senhaProvisoria();
  const senhaHash = await Bun.password.hash(senha);
  const usuario: Usuario = {
    id: idGeneratorUuid.novo(),
    redeId: dados.redeId,
    nome: dados.nome,
    email: emailNormalizado(dados.email),
    // O convite ainda não recebe CPF como entrada — a Task 4 muda a assinatura e passa a
    // preencher este campo; até lá, todo usuário nasce sem CPF.
    cpf: null,
    ativo: true,
    responsavelId,
  };

  return await gravar({ usuario, senhaHash, senhaProvisoria: senha, atribuicoes });
}
