/*
 * As telas de leitura da rede, da conta e da entrada — uma a uma.
 *
 * As suítes vizinhas alcançam estes endereços de lado: a autorização mede o status, a paginação
 * mede o recorte, as páginas de formulário medem o `action`. Nenhuma delas pergunta se a tela que
 * chegou é a tela certa. É o que se faz aqui: cada GET registrado em `rotas/rede.ts`,
 * `rotas/conta.ts` e `rotas/login.ts` é aberto com o papel que lhe cabe, e a resposta precisa
 * trazer o que só aquela tela traz — o cartão do painel, o `caption` da tabela, o campo do
 * formulário.
 *
 * Os endereços aparecem escritos por extenso, e não importados de uma constante do código de
 * produção: renomear uma rota tem de quebrar o teste, e não acompanhá-lo em silêncio.
 *
 * O que a mensagem de retorno do POST-Redirect-GET diz também é tela: `?ok=` é um código curto na
 * URL, e a frase que a pessoa lê nasce no lado do servidor. Abrir a lista com o código e não achar
 * a frase é a lista muda depois de uma gravação bem-sucedida.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { generateCpf } from '../../src/shared/document';
import { limparBanco } from '../apoio/banco';
import {
  SENHA_PADRAO,
  cenarioCompleto,
  criarRede,
  criarUnidade,
  criarUsuario,
  type Cenario,
} from '../apoio/fabricas';
import { abrir, cookieDaResposta, entrar, enviar } from './apoio';

beforeEach(limparBanco);

const entrarComo = (
  cenario: Cenario,
  quem: 'admin' | 'secretaria' | 'professor',
): Promise<string> =>
  entrar({ redeSlug: cenario.rede.slug, cpf: cenario[quem].cpf, senha: cenario.senha });

const html = async (caminho: string, cookie = ''): Promise<string> =>
  await (await abrir(caminho, cookie)).text();

/** O número que está no cartão daquele rótulo — e não um número qualquer da página. */
const numeroDoCartao = (pagina: string, rotulo: string): string => {
  const padrao = new RegExp(
    `<span class="cartao__rotulo">${rotulo}</span>\\s*<span class="cartao__numero">(\\d+)</span>`,
  );
  return padrao.exec(pagina)?.[1] ?? 'cartão ausente';
};

/* --- GET /rede -------------------------------------------------------------- */

describe('o painel da rede', () => {
  test('abre com os quatro números da rede e o ano em vigor', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComo(cenario, 'admin');

    const resposta = await abrir('/rede', cookie);
    const pagina = await resposta.text();

    expect(resposta.status).toBe(200);
    expect(pagina).toContain(`<h1 class="pagina__titulo">${cenario.rede.name}</h1>`);
    expect(numeroDoCartao(pagina, 'Unidades')).toBe(String(cenario.unidades.length));
    // As quatro contas do cenário: administração, secretaria, professor e responsável.
    expect(numeroDoCartao(pagina, 'Usuários')).toBe('4');
    expect(numeroDoCartao(pagina, 'Turmas')).toBe(String(cenario.turmas.length));
    expect(numeroDoCartao(pagina, 'Matriculados')).toBe(String(cenario.matriculas.length));
    expect(pagina).toContain(`<dd class="numero">${cenario.anoLetivo.year}</dd>`);
  });

  /**
   * Rede recém-criada é o caminho em que `contarRede` não tem ano letivo para consultar: turmas e
   * matriculados não são "ainda não calculados", são zero, e a tela precisa dizer o que falta.
   */
  test('sem ano letivo definido, conta zero turmas e aponta o próximo passo', async () => {
    const rede = await criarRede();
    const unidade = await criarUnidade({ networkId: rede.id });
    const admin = await criarUsuario({
      networkId: rede.id,
      papeis: [{ schoolId: unidade.id, role: 'network_admin' }],
    });
    const cookie = await entrar({ redeSlug: rede.slug, cpf: admin.cpf, senha: SENHA_PADRAO });

    const resposta = await abrir('/rede', cookie);
    const pagina = await resposta.text();

    expect(resposta.status).toBe(200);
    expect(numeroDoCartao(pagina, 'Turmas')).toBe('0');
    expect(numeroDoCartao(pagina, 'Matriculados')).toBe('0');
    expect(pagina).toContain('0 ano(s) definido(s)');
    expect(pagina).toContain('Nenhum ano letivo definido');
  });
});

/* --- GET /rede/unidades e /rede/unidades/nova ------------------------------- */

describe('as unidades da rede', () => {
  test('a lista traz a tabela de unidades, com nome, INEP e situação', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComo(cenario, 'admin');

    const resposta = await abrir('/rede/unidades', cookie);
    const pagina = await resposta.text();

    expect(resposta.status).toBe(200);
    expect(pagina).toContain('<caption>Unidades cadastradas</caption>');
    expect(pagina).toContain('<th scope="col">Código INEP</th>');
    expect(pagina).toContain('<th scope="col">Situação</th>');
    expect(pagina).toContain(`<th scope="row">${cenario.unidades[0].name}</th>`);
    expect(pagina).toContain(`<th scope="row">${cenario.unidades[1].name}</th>`);
    expect(pagina).toContain(`>${cenario.unidades.length} no total<`);
  });

  test('a lista lê o código do redirecionamento e mostra a frase da criação', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComo(cenario, 'admin');

    const pagina = await html('/rede/unidades?ok=unidade-criada', cookie);

    expect(pagina).toContain('class="aviso aviso--sucesso"');
    expect(pagina).toContain('Unidade criada.');
  });

  test('a página de criação traz o formulário de unidade, e não a tabela', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComo(cenario, 'admin');

    const resposta = await abrir('/rede/unidades/nova', cookie);
    const pagina = await resposta.text();

    expect(resposta.status).toBe(200);
    expect(pagina).toContain('<h1 class="pagina__titulo">Criar unidade</h1>');
    expect(pagina).toContain('name="nome"');
    expect(pagina).toContain('name="codigoInep"');
    expect(pagina).not.toContain('<caption>Unidades cadastradas</caption>');
  });
});

/* --- GET /rede/usuarios e /rede/usuarios/novo ------------------------------- */

describe('os usuários da rede', () => {
  test('a lista mostra quem tem acesso, com CPF, e-mail e papel na unidade', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComo(cenario, 'admin');

    const resposta = await abrir('/rede/usuarios', cookie);
    const pagina = await resposta.text();

    expect(resposta.status).toBe(200);
    expect(pagina).toContain('<caption>Usuários da rede</caption>');
    expect(pagina).toContain('<th scope="col">CPF</th>');
    expect(pagina).toContain('<th scope="col">Papéis</th>');
    expect(pagina).toContain(`<th scope="row">${cenario.admin.name}</th>`);
    expect(pagina).toContain(cenario.secretaria.email);
    // O papel aparece traduzido para o nome de tela, e sempre colado à unidade em que vale.
    expect(pagina).toContain(`Administração da rede · ${cenario.unidades[0].name}`);
  });

  /**
   * A senha provisória não viaja na URL: ela atravessa o redirecionamento em cookie assinado, e a
   * lista é quem a lê e a apaga. Sem sessão *e* cookie do convite juntos, o bloco não existe — e é
   * por isso que este é o único teste do arquivo que precisa fazer uma escrita antes de ler.
   */
  test('logo depois do convite, a lista publica a senha provisória e descarta o cookie', async () => {
    const cenario = await cenarioCompleto();
    const sessao = await entrarComo(cenario, 'admin');

    const criacao = await enviar(
      '/rede/usuarios',
      {
        nome: 'Nova Secretária',
        email: 'nova.secretaria@escolaviva.test',
        cpf: generateCpf(424_242),
        'unidade[]': cenario.unidades[0].id,
        'papel[]': 'registrar',
      },
      sessao,
    );
    const convite = cookieDaResposta(criacao);

    const resposta = await abrir('/rede/usuarios?ok=usuario-convidado', `${sessao}; ${convite}`);
    const pagina = await resposta.text();

    expect(criacao.status).toBe(303);
    expect(resposta.status).toBe(200);
    expect(pagina).toContain('Usuário criado. A senha provisória está logo abaixo.');
    expect(pagina).toContain('Senha provisória de Nova Secretária');
    expect(pagina).toContain('<code class="codigo">');
    // Lida uma vez, a senha não pode continuar guardada no navegador para a próxima visita.
    expect(resposta.headers.get('Set-Cookie') ?? '').toContain('ev_convite=;');
  });

  test('sem o cookie do convite, a mesma lista não publica senha nenhuma', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComo(cenario, 'admin');

    const pagina = await html('/rede/usuarios', cookie);

    expect(pagina).not.toContain('Senha provisória de');
    expect(pagina).not.toContain('<code class="codigo">');
  });

  test('a página do convite traz as três linhas de atribuição e as duas listas inteiras', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComo(cenario, 'admin');

    const resposta = await abrir('/rede/usuarios/novo', cookie);
    const pagina = await resposta.text();

    expect(resposta.status).toBe(200);
    expect(pagina).toContain('<h1 class="pagina__titulo">Convidar usuário</h1>');
    expect(pagina).toContain('name="unidade[]"');
    expect(pagina).toContain('name="papel[]"');
    expect(pagina).toContain('name="responsavelId"');
    // Sem JavaScript no cliente, as linhas são fixas: três, nem mais nem menos.
    expect(pagina).toContain('id="unidade-2"');
    expect(pagina).not.toContain('id="unidade-3"');
    // Nem a lista de unidades nem a de responsáveis é recortada: escolher exige ver tudo.
    expect(pagina).toContain(`>${cenario.unidades[1].name}</option>`);
    expect(pagina).toContain(cenario.responsaveis[4].name);
  });
});

/* --- GET /rede/anos-letivos e /rede/anos-letivos/novo ----------------------- */

describe('os anos letivos da rede', () => {
  test('a lista traz o calendário com ano, início e término', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComo(cenario, 'admin');

    const resposta = await abrir('/rede/anos-letivos', cookie);
    const pagina = await resposta.text();

    expect(resposta.status).toBe(200);
    expect(pagina).toContain('<caption>Calendário letivo da rede</caption>');
    expect(pagina).toContain('<th scope="col">Início</th>');
    expect(pagina).toContain('<th scope="col">Término</th>');
    expect(pagina).toContain(`<th scope="row" class="numero">${cenario.anoLetivo.year}</th>`);
  });

  test('a lista lê o código do redirecionamento e mostra a frase da definição', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComo(cenario, 'admin');

    const pagina = await html('/rede/anos-letivos?ok=ano-definido', cookie);

    expect(pagina).toContain('class="aviso aviso--sucesso"');
    expect(pagina).toContain('Ano letivo definido.');
  });

  test('a página de definição traz os três campos do período', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComo(cenario, 'admin');

    const resposta = await abrir('/rede/anos-letivos/novo', cookie);
    const pagina = await resposta.text();

    expect(resposta.status).toBe(200);
    expect(pagina).toContain('<h1 class="pagina__titulo">Definir ano letivo</h1>');
    expect(pagina).toContain('name="ano"');
    expect(pagina).toContain('name="dataInicio"');
    expect(pagina).toContain('name="dataFim"');
    expect(pagina).not.toContain('<caption>Calendário letivo da rede</caption>');
  });
});

/* --- GET /conta/senha ------------------------------------------------------- */

describe('a troca da própria senha', () => {
  test('a tela pede a senha atual, a nova e a confirmação', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComo(cenario, 'secretaria');

    const resposta = await abrir('/conta/senha', cookie);
    const pagina = await resposta.text();

    expect(resposta.status).toBe(200);
    expect(pagina).toContain('<h1 class="pagina__titulo">Trocar senha</h1>');
    expect(pagina).toContain('name="senhaAtual"');
    expect(pagina).toContain('name="senhaNova"');
    expect(pagina).toContain('name="senhaConfirmacao"');
  });

  test('o retorno da troca vira frase, e não o código que veio na URL', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComo(cenario, 'professor');

    const resposta = await abrir('/conta/senha?ok=senha-alterada', cookie);
    const pagina = await resposta.text();

    expect(resposta.status).toBe(200);
    expect(pagina).toContain('class="aviso aviso--sucesso"');
    expect(pagina).toContain('Senha alterada. Use a senha nova no próximo acesso.');
    expect(pagina).not.toContain('>senha-alterada<');
  });
});

/* --- GET /login ------------------------------------------------------------- */

describe('a tela de entrada', () => {
  test('abre sem sessão com os três campos do formulário', async () => {
    const resposta = await abrir('/login');
    const pagina = await resposta.text();

    expect(resposta.status).toBe(200);
    expect(pagina).toContain('<h1>Entrar</h1>');
    expect(pagina).toContain('name="redeSlug"');
    expect(pagina).toContain('name="cpf"');
    expect(pagina).toContain('name="senha"');
  });

  test('a mensagem que volta do logout aparece no aviso do topo', async () => {
    const resposta = await abrir(`/login?ok=${encodeURIComponent('Sessão encerrada.')}`);
    const pagina = await resposta.text();

    expect(resposta.status).toBe(200);
    expect(pagina).toContain('class="aviso aviso--sucesso"');
    expect(pagina).toContain('Sessão encerrada.');
  });
});
