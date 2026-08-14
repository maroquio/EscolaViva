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
import { academico, type Turma } from '../../academico';
import { identidade, type Papel } from '../../identidade';
import { config } from '../../shared/config';
import {
  exigirPapel,
  redeAtual,
  type CorpoDeFormulario,
  type Variaveis,
} from '../../shared/http';
import { logger } from '../../shared/log';
import type { ErroDeAplicacao } from '../../shared/resultado';
import { navegacao, paginaDaQuery } from '../paginacao';
import { renderizar, type DadosDeTemplate } from '../render';

const TEMPLATE_PAINEL = '/rede/painel';
const TEMPLATE_UNIDADES = '/rede/unidades';
const TEMPLATE_UNIDADE_NOVA = '/rede/unidade_nova';
const TEMPLATE_USUARIOS = '/rede/usuarios';
const TEMPLATE_USUARIO_NOVO = '/rede/usuario_novo';
const TEMPLATE_ANOS = '/rede/anos';
const TEMPLATE_ANO_NOVO = '/rede/ano_novo';

const ROTA_UNIDADES = '/rede/unidades';
const ROTA_USUARIOS = '/rede/usuarios';
const ROTA_ANOS = '/rede/anos-letivos';

/** O código volta na URL depois do POST-Redirect-GET; a frase que a pessoa lê nasce aqui. */
const MENSAGENS: Record<string, string> = {
  'unidade-criada': 'Unidade criada.',
  'usuario-convidado': 'Usuário criado. A senha provisória está logo abaixo.',
  'ano-definido': 'Ano letivo definido.',
};

/** A lista é fechada e igual à do domínio; aqui ela só ganha o nome que aparece na tela. */
const PAPEIS_DA_TELA: readonly { valor: Papel; rotulo: string }[] = [
  { valor: 'admin_rede', rotulo: 'Administração da rede' },
  { valor: 'secretaria', rotulo: 'Secretaria' },
  { valor: 'professor', rotulo: 'Professor' },
  { valor: 'responsavel', rotulo: 'Responsável' },
];

/** Sem JavaScript no cliente, "uma ou mais atribuições" são linhas fixas que podem ficar vazias. */
const LINHAS_DE_ATRIBUICAO = 3;

const ANO_EM_QUATRO_DIGITOS = /^\d{4}$/;

const ANO_INVALIDO: ErroDeAplicacao = {
  campo: 'ano',
  codigo: 'ano_invalido',
  mensagem: 'Informe o ano com quatro dígitos.',
};

const ATRIBUICAO_INCOMPLETA: ErroDeAplicacao = {
  campo: 'atribuicoes',
  codigo: 'atribuicao_incompleta',
  mensagem: 'Cada atribuição precisa de uma unidade e de um papel.',
};

export const rotasRede = new Hono<{ Variables: Variaveis }>();

rotasRede.use(exigirPapel('admin_rede'));

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

/**
 * `academico.responsavelPorId` compara o id com uma coluna `uuid`: um `responsavelId` fora do
 * formato viraria erro de conversão do PostgreSQL, e não a simples ausência de cadastro que de
 * fato é. A borda recusa antes de chegar lá — o mesmo cuidado que `secretaria.ts` já toma para
 * turma, aluno e matrícula.
 */
const FORMATO_DE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ehIdentificador = (valor: string): boolean => FORMATO_DE_ID.test(valor);

const mensagemDaQuery = (c: Context): string | undefined => MENSAGENS[c.req.query('ok') ?? ''];

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

rotasRede.get('/', async (c) => {
  const redeId = redeAtual(c);
  // `listarAnosLetivos` devolve do mais recente para o mais antigo: o primeiro é o ano em vigor.
  const anos = await academico.listarAnosLetivos(redeId);
  const anoLetivo = anos[0] ?? null;
  const contagens = await contarRede(redeId, anoLetivo === null ? null : anoLetivo.id);
  return renderizar(c, TEMPLATE_PAINEL, {
    titulo: 'Painel da rede',
    contagens,
    anoLetivo,
    anosDefinidos: anos.length,
  });
});

/* --- Unidades --------------------------------------------------------------- */

const telaDeUnidades = async (c: Context, dados: DadosDeTemplate = {}): Promise<Response> => {
  const pagina = await identidade.paginaDeUnidades(redeAtual(c), paginaDaQuery(c));
  return renderizar(c, TEMPLATE_UNIDADES, {
    titulo: 'Unidades',
    unidades: pagina.itens,
    navegacao: navegacao(c, pagina),
    ...dados,
  });
};

/** O formulário não lê a lista: recusar um nome repetido não custa a consulta paginada. */
const formDeUnidade = (c: Context, dados: DadosDeTemplate = {}): Response =>
  renderizar(c, TEMPLATE_UNIDADE_NOVA, {
    titulo: 'Criar unidade',
    valores: { nome: '', codigoInep: '' },
    erros: [],
    ...dados,
  });

rotasRede.get('/unidades', (c) => telaDeUnidades(c, { mensagem: mensagemDaQuery(c) }));

rotasRede.get('/unidades/nova', (c) => formDeUnidade(c));

rotasRede.post('/unidades', async (c) => {
  const redeId = redeAtual(c);
  const corpo = c.get('corpo');
  const valores = { nome: texto(corpo, 'nome'), codigoInep: texto(corpo, 'codigoInep') };

  const resultado = await identidade.criarUnidade({
    redeId,
    nome: valores.nome,
    codigoInep: valores.codigoInep,
  });
  if (!resultado.ok) return formDeUnidade(c, { valores, erros: resultado.erros });

  logger.info({ rede_id: redeId, unidade_id: resultado.valor.id }, 'unidade criada');
  return c.redirect(`${ROTA_UNIDADES}?ok=unidade-criada`, 303);
});

/* --- Usuários --------------------------------------------------------------- */

const COOKIE_DO_CONVITE = 'ev_convite';
const VALIDADE_DO_CONVITE_S = 120;

/**
 * A senha provisória precisa atravessar o redirecionamento do POST-Redirect-GET e aparecer uma
 * única vez. Na URL ela ficaria no histórico do navegador e na coluna `resposta_local` da tabela
 * de idempotência (I4); por isso viaja em cookie assinado, de vida curta e caminho restrito, que
 * a própria tela de destino apaga ao ler.
 */
const guardarConvite = (c: Context, usuarioId: string, senha: string): Promise<void> =>
  setSignedCookie(c, COOKIE_DO_CONVITE, `${usuarioId}:${senha}`, config.sessionSecret, {
    path: ROTA_USUARIOS,
    httpOnly: true,
    secure: config.cookieSeguro,
    sameSite: 'Lax',
    maxAge: VALIDADE_DO_CONVITE_S,
  });

const retirarConvite = async (
  c: Context,
): Promise<{ usuarioId: string; senha: string } | null> => {
  const valor = await getSignedCookie(c, config.sessionSecret, COOKIE_DO_CONVITE);
  if (typeof valor !== 'string') return null;
  deleteCookie(c, COOKIE_DO_CONVITE, { path: ROTA_USUARIOS, secure: config.cookieSeguro });
  const corte = valor.indexOf(':');
  if (corte <= 0) return null;
  return { usuarioId: valor.slice(0, corte), senha: valor.slice(corte + 1) };
};

type LinhaDeAtribuicao = { unidadeId: string; papel: string };

const ehPapel = (valor: string): valor is Papel =>
  PAPEIS_DA_TELA.some((opcao) => opcao.valor === valor);

/** As linhas voltam inteiras para a tela quando o convite é recusado, inclusive as vazias. */
const linhasDoFormulario = (corpo: CorpoDeFormulario): LinhaDeAtribuicao[] => {
  const unidades = lista(corpo, 'unidade[]');
  const papeis = lista(corpo, 'papel[]');
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
  return renderizar(c, TEMPLATE_USUARIOS, {
    titulo: 'Usuários',
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
  return renderizar(c, TEMPLATE_USUARIO_NOVO, {
    titulo: 'Convidar usuário',
    unidades,
    responsaveis,
    papeis: PAPEIS_DA_TELA,
    valores: { nome: '', email: '', cpf: '', responsavelId: '' },
    linhas: linhasVazias(),
    erros: [],
    ...dados,
  });
};

rotasRede.get('/usuarios', async (c) => {
  const convite = await retirarConvite(c);
  return await telaDeUsuarios(c, { convite, mensagem: mensagemDaQuery(c) });
});

rotasRede.get('/usuarios/novo', (c) => formDeUsuario(c));

rotasRede.post('/usuarios', async (c) => {
  const redeId = redeAtual(c);
  const corpo = c.get('corpo');
  const valores = {
    nome: texto(corpo, 'nome'),
    email: texto(corpo, 'email'),
    cpf: texto(corpo, 'cpf'),
    responsavelId: texto(corpo, 'responsavelId'),
  };
  const linhas = linhasDoFormulario(corpo);

  const preenchidas = linhas.filter((linha) => linha.unidadeId !== '' || linha.papel !== '');
  const atribuicoes = preenchidas.flatMap((linha) =>
    linha.unidadeId !== '' && ehPapel(linha.papel)
      ? [{ unidadeId: linha.unidadeId, papel: linha.papel }]
      : [],
  );
  if (atribuicoes.length !== preenchidas.length) {
    return await formDeUsuario(c, { valores, linhas, erros: [ATRIBUICAO_INCOMPLETA] });
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
    'usuário convidado',
  );
  await guardarConvite(c, resultado.valor.usuarioId, resultado.valor.senhaProvisoria);
  return c.redirect(`${ROTA_USUARIOS}?ok=usuario-convidado`, 303);
});

/* --- Anos letivos ----------------------------------------------------------- */

const telaDeAnos = async (c: Context, dados: DadosDeTemplate = {}): Promise<Response> => {
  const pagina = await academico.paginaDeAnosLetivos(redeAtual(c), paginaDaQuery(c));
  return renderizar(c, TEMPLATE_ANOS, {
    titulo: 'Anos letivos',
    anos: pagina.itens,
    navegacao: navegacao(c, pagina),
    ...dados,
  });
};

const formDeAno = (c: Context, dados: DadosDeTemplate = {}): Response =>
  renderizar(c, TEMPLATE_ANO_NOVO, {
    titulo: 'Definir ano letivo',
    valores: { ano: '', dataInicio: '', dataFim: '' },
    erros: [],
    ...dados,
  });

rotasRede.get('/anos-letivos', (c) => telaDeAnos(c, { mensagem: mensagemDaQuery(c) }));

rotasRede.get('/anos-letivos/novo', (c) => formDeAno(c));

rotasRede.post('/anos-letivos', async (c) => {
  const redeId = redeAtual(c);
  const corpo = c.get('corpo');
  const valores = {
    ano: texto(corpo, 'ano'),
    dataInicio: texto(corpo, 'dataInicio'),
    dataFim: texto(corpo, 'dataFim'),
  };

  // O caso de uso recebe número; converter texto vazio em 0 devolveria a mensagem errada.
  if (!ANO_EM_QUATRO_DIGITOS.test(valores.ano)) {
    return formDeAno(c, { valores, erros: [ANO_INVALIDO] });
  }

  const resultado = await academico.definirAnoLetivo({
    redeId,
    ano: Number(valores.ano),
    dataInicio: valores.dataInicio,
    dataFim: valores.dataFim,
  });
  if (!resultado.ok) return formDeAno(c, { valores, erros: resultado.erros });

  logger.info({ rede_id: redeId, ano_letivo_id: resultado.valor.id }, 'ano letivo definido');
  return c.redirect(`${ROTA_ANOS}?ok=ano-definido`, 303);
});
