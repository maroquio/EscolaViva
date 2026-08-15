/**
 * Administração da rede: unidades, usuários e anos letivos.
 *
 * É o papel que abre a rede para todos os outros — sem unidade não há turma, sem usuário não há
 * secretaria nem professor, sem ano letivo não há matrícula. Cada um dos três assuntos tem duas
 * telas: a lista, que só lê, e o formulário de criação, numa página própria. A separação mantém a
 * lista fora do caminho do erro de validação — recusar um formulário não recarrega mais a consulta
 * paginada que ninguém pediu.
 *
 * Os números do painel são montados a partir das portas públicas de `identidade` e `academico`
 * (I1): a camada web não conhece tabela nem consulta. Contar matriculados percorre as turmas do
 * ano em vigor, uma leitura por turma — o custo é visível de propósito, e é o mesmo custo que a
 * secretaria paga ao abrir a lista.
 */

import { Hono, type Context } from 'hono';
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie';
import { LIMITES_DO_ACADEMICO, academico, type Turma } from '../../academico';
import {
  LIMITES_DE_IDENTIDADE,
  PAPEIS,
  PAPEL,
  VOCABULARIO_DE_IDENTIDADE,
  identidade,
  type Papel,
} from '../../identidade';
import { config } from '../../shared/config';
import { TAMANHO_DO_CPF_COM_MASCARA, VARIAVEIS_DE_CONTEXTO } from '../../shared/constantes';
import {
  ehIdentificador,
  exigirPapel,
  redeAtual,
  type CorpoDeFormulario,
  type Variaveis,
} from '../../shared/http';
import { logger } from '../../shared/log';
import {
  ANO_EM_QUATRO_DIGITOS,
  AUSENTE,
  AVISOS,
  CAMPOS,
  CODIGOS_DE_AVISO,
  COOKIE_DO_CONVITE,
  ERROS_DE_FORMULARIO,
  EVENTOS_DE_LOG,
  LINHAS_DE_ATRIBUICAO,
  PARAMETROS,
  ROTAS,
  SUFIXOS_DE_ID,
  TEMPLATES,
  TITULOS,
  VALORES_INICIAIS,
} from '../constantes';
import { navegacao, paginaDaQuery } from '../paginacao';
import { renderizar, type DadosDeTemplate } from '../render';

/** O código volta na URL depois do POST-Redirect-GET; a frase que a pessoa lê nasce aqui. */
const MENSAGENS: Record<string, string> = {
  [CODIGOS_DE_AVISO.unidadeCriada]: AVISOS.unidadeCriada,
  [CODIGOS_DE_AVISO.usuarioConvidado]: AVISOS.usuarioConvidado,
  [CODIGOS_DE_AVISO.anoDefinido]: AVISOS.anoDefinido,
};

/**
 * A lista é fechada e igual à do domínio; aqui ela só ganha o nome que aparece na tela.
 *
 * Derivada de `PAPEIS`, e não redigitada: a ordem das opções do formulário passa a ser a ordem do
 * domínio, e um papel novo aparece nas duas listas de seleção sem que ninguém precise lembrar.
 */
const PAPEIS_DA_TELA: readonly { valor: Papel; rotulo: string }[] = PAPEIS.map((valor) => ({
  valor,
  rotulo: VOCABULARIO_DE_IDENTIDADE.papel[valor],
}));

/**
 * O que o `.eta` não tem como importar chega por `it`, e é este o único caminho: o Eta não lê
 * TypeScript, então redigitar `/parciais/_vazio`, `-erro` ou `120` dentro do template abriria a
 * segunda fonte de verdade que a constante existe para fechar. Quem sabe ler `constantes.ts` é o
 * handler, e é ele que carrega o valor até a tela.
 *
 * `PARCIAIS` vai para as três listas e para o painel, que incluem `_vazio` e `_paginacao`;
 * `SUFIXOS` vai para os três formulários, cujos `id=` precisam casar, byte a byte, com o que
 * `descricao()` monta em `render.ts`.
 */
const PARCIAIS = { parciais: TEMPLATES.parciais };
const SUFIXOS = { sufixos: SUFIXOS_DE_ID };

export const rotasRede = new Hono<{ Variables: Variaveis }>();

rotasRede.use(exigirPapel(PAPEL.adminRede));

/* --- Leitura do formulário -------------------------------------------------- */

const texto = (corpo: CorpoDeFormulario, campo: string): string => {
  const valor = corpo[campo];
  return typeof valor === 'string' ? valor.trim() : '';
};

/** Campo repetido chega como lista porque o nome termina em `[]`; um só valor chega sozinho. */
const lista = (corpo: CorpoDeFormulario, campo: string): string[] => {
  const valor = corpo[campo];
  if (Array.isArray(valor)) return valor.map((item) => (typeof item === 'string' ? item.trim() : ''));
  return typeof valor === 'string' ? [valor.trim()] : [];
};

const mensagemDaQuery = (c: Context): string | undefined =>
  MENSAGENS[c.req.query(PARAMETROS.ok) ?? ''];

/* --- Painel da rede --------------------------------------------------------- */

type ContagensDaRede = { unidades: number; usuarios: number; turmas: number; matriculados: number };

const contarRede = async (redeId: string, anoLetivoId: string | null): Promise<ContagensDaRede> => {
  // Contar não é listar: unidades e usuários saem de duas agregações, e não de duas listas
  // inteiras trazidas até aqui para terem o `length` lido.
  const [{ unidades, usuarios }, turmas] = await Promise.all([
    identidade.contarUnidadesEUsuarios(redeId),
    anoLetivoId === null
      ? Promise.resolve<Turma[]>([])
      : academico.listarTurmas(redeId, { anoLetivoId }),
  ]);
  const matriculas = await Promise.all(
    turmas.map((turma) => academico.matriculasAtivasDaTurma(redeId, turma.id)),
  );
  return {
    unidades,
    usuarios,
    turmas: turmas.length,
    matriculados: matriculas.reduce((total, daTurma) => total + daTurma.length, 0),
  };
};

rotasRede.get(ROTAS.rede.painel.padrao, async (c) => {
  const redeId = redeAtual(c);
  // `listarAnosLetivos` devolve do mais recente para o mais antigo: o primeiro é o ano em vigor.
  const anos = await academico.listarAnosLetivos(redeId);
  const anoLetivo = anos[0] ?? null;
  const contagens = await contarRede(redeId, anoLetivo === null ? null : anoLetivo.id);
  return renderizar(c, TEMPLATES.rede.painel, {
    ...PARCIAIS,
    titulo: TITULOS.rede.painel,
    contagens,
    anoLetivo,
    anosDefinidos: anos.length,
  });
});

/* --- Unidades --------------------------------------------------------------- */

const telaDeUnidades = async (c: Context, dados: DadosDeTemplate = {}): Promise<Response> => {
  const pagina = await identidade.paginaDeUnidades(redeAtual(c), paginaDaQuery(c));
  return renderizar(c, TEMPLATES.rede.unidades, {
    ...PARCIAIS,
    titulo: TITULOS.rede.unidades,
    // A etiqueta e o travessão da célula vazia são vocabulário de quem os decide: a situação da
    // unidade é da identidade, o travessão é de `shared`. O `.eta` só os recebe.
    rotuloDaSituacao: VOCABULARIO_DE_IDENTIDADE.unidadeAtiva,
    ausente: AUSENTE,
    unidades: pagina.itens,
    navegacao: navegacao(c, pagina),
    ...dados,
  });
};

/** O formulário não lê a lista: recusar um nome repetido não custa a consulta paginada. */
const formDeUnidade = (c: Context, dados: DadosDeTemplate = {}): Response =>
  renderizar(c, TEMPLATES.rede.unidadeNova, {
    ...SUFIXOS,
    titulo: TITULOS.rede.unidadeNova,
    valores: VALORES_INICIAIS.unidade,
    limiteDoNome: LIMITES_DE_IDENTIDADE.unidade.nome,
    limiteDoCodigoInep: LIMITES_DE_IDENTIDADE.unidade.codigoInep,
    erros: [],
    ...dados,
  });

rotasRede.get(ROTAS.rede.unidades.padrao, (c) =>
  telaDeUnidades(c, { mensagem: mensagemDaQuery(c) }),
);

rotasRede.get(ROTAS.rede.unidadeNova.padrao, (c) => formDeUnidade(c));

rotasRede.post(ROTAS.rede.unidades.padrao, async (c) => {
  const redeId = redeAtual(c);
  const corpo = c.get(VARIAVEIS_DE_CONTEXTO.corpo);
  const valores = {
    nome: texto(corpo, CAMPOS.unidade.nome),
    codigoInep: texto(corpo, CAMPOS.unidade.codigoInep),
  };

  const resultado = await identidade.criarUnidade({
    redeId,
    nome: valores.nome,
    codigoInep: valores.codigoInep,
  });
  if (!resultado.ok) return formDeUnidade(c, { valores, erros: resultado.erros });

  logger.info({ rede_id: redeId, unidade_id: resultado.valor.id }, EVENTOS_DE_LOG.unidadeCriada);
  return c.redirect(
    `${ROTAS.rede.unidades()}?${PARAMETROS.ok}=${CODIGOS_DE_AVISO.unidadeCriada}`,
    303,
  );
});

/* --- Usuários --------------------------------------------------------------- */

/**
 * A senha provisória precisa atravessar o redirecionamento do POST-Redirect-GET e aparecer uma
 * única vez. Na URL ela ficaria no histórico do navegador e na coluna `resposta_local` da tabela
 * de idempotência (I4); por isso viaja em cookie assinado, de vida curta e caminho restrito, que
 * a própria tela de destino apaga ao ler.
 */
const guardarConvite = (c: Context, usuarioId: string, senha: string): Promise<void> =>
  setSignedCookie(
    c,
    COOKIE_DO_CONVITE.nome,
    `${usuarioId}${COOKIE_DO_CONVITE.separador}${senha}`,
    config.sessionSecret,
    {
      path: ROTAS.rede.usuarios(),
      httpOnly: true,
      secure: config.cookieSeguro,
      sameSite: COOKIE_DO_CONVITE.sameSite,
      maxAge: COOKIE_DO_CONVITE.validadeEmSegundos,
    },
  );

const retirarConvite = async (
  c: Context,
): Promise<{ usuarioId: string; senha: string } | null> => {
  const valor = await getSignedCookie(c, config.sessionSecret, COOKIE_DO_CONVITE.nome);
  if (typeof valor !== 'string') return null;
  deleteCookie(c, COOKIE_DO_CONVITE.nome, {
    path: ROTAS.rede.usuarios(),
    secure: config.cookieSeguro,
  });
  const corte = valor.indexOf(COOKIE_DO_CONVITE.separador);
  if (corte <= 0) return null;
  return { usuarioId: valor.slice(0, corte), senha: valor.slice(corte + 1) };
};

type LinhaDeAtribuicao = { unidadeId: string; papel: string };

const ehPapel = (valor: string): valor is Papel =>
  PAPEIS_DA_TELA.some((opcao) => opcao.valor === valor);

/** As linhas voltam inteiras para a tela quando o convite é recusado, inclusive as vazias. */
const linhasDoFormulario = (corpo: CorpoDeFormulario): LinhaDeAtribuicao[] => {
  const unidades = lista(corpo, CAMPOS.usuario.unidades);
  const papeis = lista(corpo, CAMPOS.usuario.papeis);
  const total = Math.max(unidades.length, papeis.length, LINHAS_DE_ATRIBUICAO);
  return Array.from({ length: total }, (_, indice) => ({
    unidadeId: unidades[indice] ?? '',
    papel: papeis[indice] ?? '',
  }));
};

const linhasVazias = (): LinhaDeAtribuicao[] =>
  Array.from({ length: LINHAS_DE_ATRIBUICAO }, () => ({ unidadeId: '', papel: '' }));

/**
 * A lista traz `papeis` só para traduzir a sigla da atribuição em nome de tela; as duas listas de
 * seleção do convite não são problema seu, e é por isso que abrir `/rede/usuarios` deixou de
 * carregar todas as unidades e todos os responsáveis da rede.
 */
const telaDeUsuarios = async (c: Context, dados: DadosDeTemplate = {}): Promise<Response> => {
  const pagina = await identidade.paginaDeUsuarios(redeAtual(c), paginaDaQuery(c));
  return renderizar(c, TEMPLATES.rede.usuarios, {
    ...PARCIAIS,
    titulo: TITULOS.rede.usuarios,
    // Mesma regra da lista de unidades: a palavra que a etiqueta mostra é da identidade.
    rotuloDaSituacao: VOCABULARIO_DE_IDENTIDADE.ativo,
    semPapel: VOCABULARIO_DE_IDENTIDADE.semPapel,
    usuarios: pagina.itens,
    navegacao: navegacao(c, pagina),
    papeis: PAPEIS_DA_TELA,
    convite: null,
    ...dados,
  });
};

/**
 * A tabela da lista é paginada, os dois campos de seleção daqui não: unidade e responsável
 * precisam da lista inteira para que o convite possa apontar para qualquer uma delas. Recortar o
 * que a pessoa lê é cuidado com o banco; recortar o que ela pode escolher seria esconder opção sem
 * avisar.
 */
const formDeUsuario = async (c: Context, dados: DadosDeTemplate = {}): Promise<Response> => {
  const redeId = redeAtual(c);
  const [unidades, responsaveis] = await Promise.all([
    identidade.listarUnidades(redeId),
    academico.listarResponsaveis(redeId),
  ]);
  return renderizar(c, TEMPLATES.rede.usuarioNovo, {
    ...SUFIXOS,
    titulo: TITULOS.rede.usuarioNovo,
    unidades,
    responsaveis,
    papeis: PAPEIS_DA_TELA,
    valores: VALORES_INICIAIS.usuario,
    limiteDoNome: LIMITES_DE_IDENTIDADE.usuario.nome,
    // Limita o que cabe na caixa; quem decide se o CPF vale é `shared/documento`, que aceita com
    // ou sem pontuação.
    tamanhoDoCpf: TAMANHO_DO_CPF_COM_MASCARA,
    linhas: linhasVazias(),
    erros: [],
    ...dados,
  });
};

rotasRede.get(ROTAS.rede.usuarios.padrao, async (c) => {
  const convite = await retirarConvite(c);
  return await telaDeUsuarios(c, { convite, mensagem: mensagemDaQuery(c) });
});

rotasRede.get(ROTAS.rede.usuarioNovo.padrao, (c) => formDeUsuario(c));

rotasRede.post(ROTAS.rede.usuarios.padrao, async (c) => {
  const redeId = redeAtual(c);
  const corpo = c.get(VARIAVEIS_DE_CONTEXTO.corpo);
  const valores = {
    nome: texto(corpo, CAMPOS.usuario.nome),
    email: texto(corpo, CAMPOS.usuario.email),
    cpf: texto(corpo, CAMPOS.usuario.cpf),
    responsavelId: texto(corpo, CAMPOS.usuario.responsavelId),
  };
  const linhas = linhasDoFormulario(corpo);

  const preenchidas = linhas.filter((linha) => linha.unidadeId !== '' || linha.papel !== '');
  const atribuicoes = preenchidas.flatMap((linha) =>
    linha.unidadeId !== '' && ehPapel(linha.papel)
      ? [{ unidadeId: linha.unidadeId, papel: linha.papel }]
      : [],
  );
  if (atribuicoes.length !== preenchidas.length) {
    return await formDeUsuario(c, {
      valores,
      linhas,
      erros: [ERROS_DE_FORMULARIO.atribuicaoIncompleta],
    });
  }

  // Só a camada web enxerga identidade e academico ao mesmo tempo (I1): é aqui, e só aqui, que o
  // CPF digitado pode ser comparado com o do cadastro que o convite alega representar.
  const cadastro =
    valores.responsavelId === '' || !ehIdentificador(valores.responsavelId)
      ? null
      : await academico.responsavelPorId(redeId, valores.responsavelId);

  const resultado = await identidade.convidarUsuario({
    redeId,
    nome: valores.nome,
    email: valores.email,
    cpf: valores.cpf,
    cpfDoCadastro: cadastro?.cpf ?? null,
    ...(cadastro === null ? {} : { nomeDoCadastro: cadastro.nome }),
    atribuicoes,
    responsavelId: valores.responsavelId === '' ? null : valores.responsavelId,
  });
  if (!resultado.ok) return await formDeUsuario(c, { valores, linhas, erros: resultado.erros });

  // A senha provisória não entra no log — nem aqui, nem em lugar nenhum.
  logger.info(
    { rede_id: redeId, usuario_id: resultado.valor.usuarioId, atribuicoes: atribuicoes.length },
    EVENTOS_DE_LOG.usuarioConvidado,
  );
  await guardarConvite(c, resultado.valor.usuarioId, resultado.valor.senhaProvisoria);
  return c.redirect(
    `${ROTAS.rede.usuarios()}?${PARAMETROS.ok}=${CODIGOS_DE_AVISO.usuarioConvidado}`,
    303,
  );
});

/* --- Anos letivos ----------------------------------------------------------- */

const telaDeAnos = async (c: Context, dados: DadosDeTemplate = {}): Promise<Response> => {
  const pagina = await academico.paginaDeAnosLetivos(redeAtual(c), paginaDaQuery(c));
  return renderizar(c, TEMPLATES.rede.anos, {
    ...PARCIAIS,
    titulo: TITULOS.rede.anos,
    anos: pagina.itens,
    navegacao: navegacao(c, pagina),
    ...dados,
  });
};

const formDeAno = (c: Context, dados: DadosDeTemplate = {}): Response =>
  renderizar(c, TEMPLATES.rede.anoNovo, {
    ...SUFIXOS,
    titulo: TITULOS.rede.anoNovo,
    valores: VALORES_INICIAIS.anoLetivo,
    // A faixa é do caso de uso, que recusa o mesmo intervalo com `MENSAGENS.anoLetivo.*`; no
    // formulário ela só adianta a recusa no navegador.
    anoMinimo: LIMITES_DO_ACADEMICO.anoLetivo.anoMinimo,
    anoMaximo: LIMITES_DO_ACADEMICO.anoLetivo.anoMaximo,
    erros: [],
    ...dados,
  });

rotasRede.get(ROTAS.rede.anosLetivos.padrao, (c) =>
  telaDeAnos(c, { mensagem: mensagemDaQuery(c) }),
);

rotasRede.get(ROTAS.rede.anoLetivoNovo.padrao, (c) => formDeAno(c));

rotasRede.post(ROTAS.rede.anosLetivos.padrao, async (c) => {
  const redeId = redeAtual(c);
  const corpo = c.get(VARIAVEIS_DE_CONTEXTO.corpo);
  const valores = {
    ano: texto(corpo, CAMPOS.anoLetivo.ano),
    dataInicio: texto(corpo, CAMPOS.anoLetivo.dataInicio),
    dataFim: texto(corpo, CAMPOS.anoLetivo.dataFim),
  };

  // O caso de uso recebe número; converter texto vazio em 0 devolveria a mensagem errada.
  if (!ANO_EM_QUATRO_DIGITOS.test(valores.ano)) {
    return formDeAno(c, { valores, erros: [ERROS_DE_FORMULARIO.anoInvalido] });
  }

  const resultado = await academico.definirAnoLetivo({
    redeId,
    ano: Number(valores.ano),
    dataInicio: valores.dataInicio,
    dataFim: valores.dataFim,
  });
  if (!resultado.ok) return formDeAno(c, { valores, erros: resultado.erros });

  logger.info(
    { rede_id: redeId, ano_letivo_id: resultado.valor.id },
    EVENTOS_DE_LOG.anoLetivoDefinido,
  );
  return c.redirect(
    `${ROTAS.rede.anosLetivos()}?${PARAMETROS.ok}=${CODIGOS_DE_AVISO.anoDefinido}`,
    303,
  );
});
