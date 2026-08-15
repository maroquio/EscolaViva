import { z } from 'zod';
import { unidadeDeTrabalho } from '../../shared/db';
import { cpfValido, normalizarCpf } from '../../shared/documento';
import { idGeneratorUuid } from '../../shared/ports';
import { errosDeSchema, falha, falhaDeCampo, sucesso, type Resultado } from '../../shared/resultado';
import {
  CAMPOS,
  CODIGOS,
  LIMITES,
  MENSAGENS,
  PAPEL,
  SEGURANCA,
  SEPARADOR_DE_ATRIBUICAO,
} from '../constantes';
import { PAPEIS, type Papel } from '../dominio/papel';
import { emailNormalizado, type Usuario } from '../dominio/usuario';
import * as unidadeRepositorio from '../infra/unidadeRepositorio';
import * as usuarioRepositorio from '../infra/usuarioRepositorio';

const schema = z.object({
  redeId: z.string().uuid(MENSAGENS.usuario.redeInvalida),
  nome: z
    .string()
    .trim()
    .min(1, MENSAGENS.usuario.nomeObrigatorio)
    .max(LIMITES.usuario.nome, MENSAGENS.usuario.nomeLongo),
  email: z.string().trim().min(1, MENSAGENS.usuario.emailObrigatorio).email(
    MENSAGENS.usuario.emailInvalido,
  ),
  cpf: z
    .string()
    .trim()
    .transform(normalizarCpf)
    .refine(cpfValido, MENSAGENS.usuario.cpfInvalido),
  // O cadastro do responsável vive em `academico`, e `identidade` não pode alcançá-lo: quem o
  // busca é a camada web, que já orquestra os dois módulos. Aqui chega só o que a regra compara.
  cpfDoCadastro: z.string().nullable().optional(),
  nomeDoCadastro: z.string().optional(),
  atribuicoes: z
    .array(
      z.object({
        unidadeId: z.string().uuid(MENSAGENS.usuario.unidadeInvalida),
        papel: z.enum(PAPEIS, {
          errorMap: () => ({ message: MENSAGENS.usuario.papelDesconhecido }),
        }),
      }),
    )
    .min(1, MENSAGENS.usuario.semAtribuicao),
  responsavelId: z.string().uuid(MENSAGENS.usuario.responsavelInvalido).nullable().optional(),
});

function senhaProvisoria(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(SEGURANCA.tamanhoDaSenhaProvisoria));
  // O alfabeto tem 32 símbolos e 256 é múltiplo de 32: o resto não distorce o sorteio.
  return Array.from(bytes, (byte) =>
    SEGURANCA.alfabetoSemAmbiguidade.charAt(byte % SEGURANCA.alfabetoSemAmbiguidade.length),
  ).join('');
}

type Atribuicao = { unidadeId: string; papel: Papel };

/** O formulário pode repetir o par unidade+papel; a chave primária de `papel_usuario` não pode. */
function atribuicoesDistintas(atribuicoes: Atribuicao[]): Atribuicao[] {
  const porChave = new Map<string, Atribuicao>();
  for (const atribuicao of atribuicoes) {
    porChave.set(
      `${atribuicao.unidadeId}${SEPARADOR_DE_ATRIBUICAO}${atribuicao.papel}`,
      atribuicao,
    );
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
        CAMPOS.usuario.atribuicoes,
        CODIGOS.unidadeDeOutraRede,
        MENSAGENS.usuario.unidadeDeOutraRede,
      );
    }
    if (await usuarioRepositorio.existeEmail(sql, usuario.redeId, usuario.email)) {
      return falhaDeCampo(CAMPOS.usuario.email, CODIGOS.emailEmUso, MENSAGENS.usuario.emailEmUso);
    }
    if (await usuarioRepositorio.existeCpf(sql, usuario.redeId, usuario.cpf)) {
      return falhaDeCampo(CAMPOS.usuario.cpf, CODIGOS.cpfEmUso, MENSAGENS.usuario.cpfEmUso);
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
  cpf: string;
  cpfDoCadastro?: string | null;
  nomeDoCadastro?: string;
  atribuicoes: Atribuicao[];
  responsavelId?: string | null | undefined;
}): Promise<Resultado<ConviteAceito>> {
  const analise = schema.safeParse(entrada);
  if (!analise.success) return falha(...errosDeSchema(analise.error.issues));
  const dados = analise.data;

  const atribuicoes = atribuicoesDistintas(dados.atribuicoes);
  const responsavelId = dados.responsavelId ?? null;
  const entraComoResponsavel = atribuicoes.some(({ papel }) => papel === PAPEL.responsavel);
  if (entraComoResponsavel && responsavelId === null) {
    return falhaDeCampo(
      CAMPOS.usuario.responsavelId,
      CODIGOS.responsavelObrigatorio,
      MENSAGENS.usuario.responsavelObrigatorio,
    );
  }

  // Só confere quando o cadastro já tem CPF. Sem CPF não há divergência a impedir — é o que
  // mantém o convite funcionando para os responsáveis cadastrados antes da migração 0007.
  const cpfDoCadastro = dados.cpfDoCadastro ?? null;
  if (cpfDoCadastro !== null && cpfDoCadastro !== dados.cpf) {
    return falhaDeCampo(
      CAMPOS.usuario.cpf,
      CODIGOS.cpfDivergeDoCadastro,
      MENSAGENS.usuario.cpfDivergeDoCadastro(
        dados.nomeDoCadastro ?? MENSAGENS.usuario.rotuloDeResponsavel,
      ),
    );
  }

  const senha = senhaProvisoria();
  const senhaHash = await Bun.password.hash(senha);
  const usuario: Usuario = {
    id: idGeneratorUuid.novo(),
    redeId: dados.redeId,
    nome: dados.nome,
    email: emailNormalizado(dados.email),
    cpf: dados.cpf,
    ativo: true,
    responsavelId,
  };

  return await gravar({ usuario, senhaHash, senhaProvisoria: senha, atribuicoes });
}
