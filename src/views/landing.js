import { NO_LOGIN, signIn } from '../app/init.js';
import { googleLogo, icon } from '../app/render.js';
import { el } from '../core/utils.ts';
import { startDemo } from '../features/sample-and-tour.js';

/* ----- Página de entrada -----
   Mostra o que o painel faz de verdade, com exemplos montados em HTML (dados fictícios, sempre marcados).
   Sem preços, depoimentos, avaliações ou números do negócio: isso só entra quando vier do dono. */

const ic = (n, s = 18) => icon(n, s);
const tag = t => el('span', { class: 'lx-tag', text: t });
const fict = () => el('span', { class: 'lx-fict', text: 'dados fictícios' });

// botões de entrada: Google na versão com conta; "Entrar" (demonstração) no GitHub Pages
function enterButtons(big = true) {
  if (NO_LOGIN) return el('div', { class: 'lx-btns' }, el('button', { class: 'btn primary lx-enter' + (big ? ' big' : ''), onclick: startDemo }, 'Entrar', ic('arrow', 15)));
  const g = el('button', { class: 'google-btn', onclick: () => signIn(g) }, googleLogo(), 'Entrar com Google');
  return el('div', { class: 'lx-btns' }, g, el('button', { class: 'btn lp-demo', onclick: startDemo }, big ? 'Ver demonstração sem conta' : 'Ver demonstração'));
}

/* ---------- herói: janela do app ---------- */
function heroChart() {
  const vals = [14200, 15100, 13800, 15900, 16700, 18420], meses = ['mai', 'jun', 'jul', 'ago', 'set', 'out'];
  const W = 460, H = 150, L = 6, R = 10, T = 12, B = 24, lo = 12000, hi = 20000;
  const x = i => L + i * (W - L - R) / (vals.length - 1), y = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' '), last = vals.length - 1;
  const grid = [14000, 16000, 18000].map(g => `<line x1="${L}" x2="${W - R}" y1="${y(g).toFixed(1)}" y2="${y(g).toFixed(1)}" style="stroke:var(--grid)"/>`).join('');
  const lbls = meses.map((m, i) => `<text x="${x(i).toFixed(1)}" y="${H - 5}" text-anchor="${i === 0 ? 'start' : i === last ? 'end' : 'middle'}">${m}</text>`).join('');
  const d = el('div');
  d.innerHTML = `<svg class="lx-line" viewBox="0 0 ${W} ${H}" role="img" aria-label="Faturamento de maio a outubro, subindo nos últimos três meses">${grid}` +
    `<polygon points="${x(0)},${H - B} ${pts} ${x(last)},${H - B}" style="fill:var(--accent)" fill-opacity=".1"/>` +
    `<polyline points="${pts}" fill="none" style="stroke:var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>` +
    `<circle cx="${x(last)}" cy="${y(vals[last])}" r="4" style="fill:var(--accent);stroke:var(--surface)" stroke-width="2"/>${lbls}</svg>`;
  return d.firstChild;
}
function heroWindow() {
  const nav = (n, t, on) => el('div', { class: 'lx-wn' + (on ? ' on' : '') }, ic(n, 13), el('span', { text: t }));
  const kpi = (k, v, d) => el('div', { class: 'lx-kpi' }, el('small', { text: k }), el('b', { text: v }), d ? el('span', { class: 'up', text: d }) : null);
  return el('div', { class: 'lx-hero-vis' },
    el('div', { class: 'lx-win', 'aria-label': 'Exemplo do painel com dados fictícios' },
      el('div', { class: 'lx-win-bar' }, el('i'), el('i'), el('i'), el('span', { text: 'Painel de Planilhas' })),
      el('div', { class: 'lx-win-body' },
        el('div', { class: 'lx-win-side' }, nav('home', 'Início'), nav('board', 'Painel geral'), el('small', { text: 'Minhas planilhas' }),
          nav('sheet', 'Vendas 2026', true), nav('building', 'Extrato do banco'), nav('file', 'Notas fiscais')),
        el('div', { class: 'lx-win-main' },
          el('div', { class: 'lx-win-h' }, el('b', { text: 'Vendas 2026' }), fict()),
          el('div', { class: 'lx-win-tabs' }, el('span', { text: 'Dados' }), el('span', { class: 'on', text: 'Gráficos' }), el('span', { text: 'Relatórios' })),
          el('div', { class: 'lx-kpis' }, kpi('Faturamento (out)', '18.420,50', '+10,3% vs set'), kpi('Pedidos', '312'), kpi('Ticket médio', '59,04')),
          el('div', { class: 'lx-card' }, el('div', { class: 'lx-card-t', text: 'Faturamento ao longo do tempo' }), heroChart(),
            el('p', { class: 'lx-note' }, el('b', { text: 'Sobre este gráfico: ' }), 'o faturamento subiu três meses seguidos e outubro foi o maior mês do período.'))))),
    el('div', { class: 'lx-float lx-float-ask' }, ic('search', 14), el('span', {}, el('small', { text: 'Pergunta' }), 'qual vendedor vendeu mais?')),
    el('div', { class: 'lx-float lx-float-goal' }, el('small', { text: 'Meta de outubro · 92%' }), el('div', { class: 'lx-bar' }, el('i', { style: 'width:92%' }), el('u', { style: 'left:73%' })), el('span', { class: 'ok', text: 'Acima do ritmo' })));
}

/* ---------- exemplos ---------- */
function exClean() {
  const t = (cls, head, rows) => el('table', { class: 'lx-tbl ' + cls }, el('thead', {}, el('tr', {}, ...head.map(h => el('th', { text: h })))),
    el('tbody', {}, ...rows.map(r => el('tr', { class: r.cls || '' }, ...r.v.map(v => el('td', { text: v }))))));
  const before = t('before', ['Data', 'Vendedor', 'Valor'], [
    { v: ['05/10/2026', 'Ana Silva   ', 'R$ 1.200,00'] }, { v: ['Data', 'Vendedor', 'Valor'], cls: 'x' }, { v: ['06/10/2026', 'ANA SILVA', '980,50'] },
    { v: ['07/10/2026', 'Bruno', 'N/A'] }, { v: ['', '', ''], cls: 'x blank' }, { v: ['TOTAL', '', '2.180,50'], cls: 'x' }]);
  const after = t('after', ['Data', 'Vendedor', 'Valor'], [{ v: ['05/10/2026', 'Ana Silva', '1.200,00'] }, { v: ['06/10/2026', 'Ana Silva', '980,50'] }, { v: ['07/10/2026', 'Bruno', '—'] }]);
  return el('div', { class: 'lx-vis lx-clean' },
    el('div', {}, el('div', { class: 'lx-vis-l' }, 'Como o arquivo chegou'), before),
    el('div', { class: 'lx-arrow', 'aria-hidden': 'true', text: '→' }),
    el('div', {}, el('div', { class: 'lx-vis-l' }, 'Como fica no painel'), after));
}
function exCharts() {
  const rk = [['Carla', 12840], ['Bruno', 9310], ['Ana', 7920], ['Diego', 5130]], max = rk[0][1];
  const fmt = v => v.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  return el('div', { class: 'lx-vis' },
    el('div', { class: 'lx-card' }, el('div', { class: 'lx-card-t' }, 'Ranking de vendedores', fict()),
      el('div', { class: 'lx-hbars' }, ...rk.map(([n, v], i) => el('div', { class: 'lx-hb' }, el('span', { text: n }),
        el('div', { class: 'lx-hb-t' }, el('i', { class: i ? '' : 'hi', style: `width:${(v / max * 100).toFixed(1)}%` })), el('b', { text: fmt(v) })))),
      el('p', { class: 'lx-note' }, el('b', { text: 'Sobre este gráfico: ' }), 'quem mais vendeu foi “Carla”, com 12.840,00 (36,5% do total). Os 3 primeiros concentram 85,4%.')),
    el('div', { class: 'lx-chips' }, ...['Barras', 'Linha com previsão', 'Pizza', 'Mapa do Brasil', 'Funil', 'Empilhadas', 'Tabela dinâmica'].map(tag)));
}
function exAsk() {
  return el('div', { class: 'lx-vis' },
    el('div', { class: 'lx-ask' }, ic('search', 16), el('span', { text: 'quanto a Ana vendeu em março?' }), el('em', { text: 'Perguntar' })),
    el('div', { class: 'lx-card' },
      el('div', { class: 'lx-under' }, el('small', { text: 'Entendi assim' }), tag('Soma de Valor'), tag('Vendedor: Ana'), tag('março de 2026')),
      el('div', { class: 'lx-big' }, '3.415,80', fict()),
      el('p', { class: 'lx-note', text: 'Quando não entende, o painel não chuta: mostra perguntas que funcionam com as colunas da sua planilha.' })),
    el('div', { class: 'lx-chips' }, ...['qual vendedor vendeu mais?', 'quanto gastei este mês?', 'top 5 produtos', 'em que categoria gastei mais?'].map(t => el('span', { class: 'lx-q', text: t }))));
}
function exBank() {
  const rows = [['01/11', 'Salário Empresa X', 'Salário e renda', '+3.500,00', 'in'], ['03/11', 'Padaria São João', 'Alimentação', '−45,90'], ['05/11', 'Supermercado Bom Preço', 'Mercado', '−230,00'],
    ['06/11', 'Posto Avenida', 'Combustível', '−180,00'], ['08/11', 'Pix enviado', 'Transferências e Pix', '−120,00']];
  const cats = [['Mercado', 230], ['Combustível', 180], ['Transferências e Pix', 120], ['Alimentação', 45.9]];
  return el('div', { class: 'lx-vis' },
    el('div', { class: 'lx-card lx-bank' }, el('div', { class: 'lx-card-t' }, 'Extrato · novembro', fict()),
      ...rows.map(([d, n, c, v, k]) => el('div', { class: 'lx-tx' }, el('small', { text: d }), el('span', { text: n }), tag(c), el('b', { class: k || 'out', text: v })))),
    el('div', { class: 'lx-card' }, el('div', { class: 'lx-card-t', text: 'Gastos por categoria' }),
      el('div', { class: 'lx-hbars' }, ...cats.map(([n, v], i) => el('div', { class: 'lx-hb' }, el('span', { text: n }), el('div', { class: 'lx-hb-t' }, el('i', { class: i ? '' : 'hi', style: `width:${(v / 230 * 100).toFixed(1)}%` })), el('b', { text: v.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) }))))));
}
function exNfe() {
  return el('div', { class: 'lx-vis' },
    el('div', { class: 'lx-files' }, ...['nota-1234.xml', 'nota-1235.xml', 'nota-1236.xml'].map(f => el('span', { class: 'lx-file' }, ic('file', 14), f)), el('span', { class: 'lx-arrow sm', text: '→' }), el('span', { class: 'lx-file on' }, ic('sheet', 14), 'Notas fiscais (3)')),
    el('div', { class: 'lx-card' }, el('div', { class: 'lx-card-t' }, 'Um item da nota por linha', fict()),
      el('table', { class: 'lx-tbl after' }, el('thead', {}, el('tr', {}, ...['Nota', 'Produto', 'NCM', 'CFOP', 'Qtd.', 'Valor do item'].map(h => el('th', { text: h })))),
        el('tbody', {}, ...[['1234', 'Caneta azul', '96081000', '6102', '10', '25,00'], ['1234', 'Caderno 100 folhas', '48202000', '6102', '3', '45,00'], ['1235', 'Grampeador', '84721000', '5102', '1', '38,90']]
          .map(r => el('tr', {}, ...r.map(v => el('td', { text: v }))))))));
}
function exGoals() {
  const goal = (t, meta, pct, tick, st, warn) => el('div', { class: 'lx-goal' + (warn ? ' warn' : '') },
    el('div', { class: 'lx-goal-h' }, el('span', {}, t, ' · ', el('b', { text: meta })), el('b', { text: pct + '%' })),
    el('div', { class: 'lx-bar' }, el('i', { style: `width:${pct}%` }), el('u', { style: `left:${tick}%`, title: 'Onde você deveria estar hoje' })),
    el('small', { text: st }));
  return el('div', { class: 'lx-vis' },
    el('div', { class: 'lx-card' }, el('div', { class: 'lx-card-t' }, 'Metas de outubro', fict()),
      goal('Faturamento do mês', 'meta 20.000', 92, 73, 'Acima do ritmo: faltam 1.579,50 para a meta'),
      goal('Gastos com fornecedores', 'limite 8.000', 81, 73, 'Atenção: gastando mais rápido que o ritmo do mês', true),
      el('div', { class: 'lx-alert' }, ic('info', 15), el('span', {}, el('b', { text: 'Fora do padrão: ' }), 'as vendas de terça ficaram bem abaixo do normal.'))));
}
function exShare() {
  const tile = (n, t, d) => el('div', { class: 'lx-tile' }, el('span', { class: 'lx-ic' }, ic(n, 18)), el('b', { text: t }), el('small', { text: d }));
  return el('div', { class: 'lx-vis lx-tiles' },
    tile('pdf', 'Relatório em PDF', 'Gráficos com explicação, seu logo e sua cor'),
    tile('image', 'Imagem para WhatsApp', 'Um gráfico pronto para mandar no celular'),
    tile('slides', 'Apresentação', 'Slides para reunião, também em PowerPoint'),
    tile('sheet', 'Excel', 'Os dados limpos, de volta numa planilha'),
    tile('tv', 'Modo TV', 'Painel em tela cheia para a TV da empresa'),
    NO_LOGIN ? tile('board', 'Painel geral', 'Gráficos de várias planilhas numa tela') : tile('send', 'Link para clientes', 'Painel somente leitura, sem precisar de conta'));
}

function showcase(n, kicker, title, text, points, vis, flip) {
  return el('div', { class: 'lx-show' + (flip ? ' flip' : '') },
    el('div', { class: 'lx-show-txt' },
      el('div', { class: 'lx-kick' }, el('span', { class: 'n', text: n }), kicker),
      el('h3', { text: title }), el('p', { text }),
      el('ul', { class: 'lx-points' }, ...points.map(p => el('li', {}, ic('check', 15), el('span', { text: p }))))),
    vis);
}

/* ---------- página ---------- */
function loginScreen() {
  const go = id => e => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const nav = el('nav', { class: 'lx-nav', 'aria-label': 'Seções da página' },
    ...[['lx-como', 'Como funciona'], ['lx-exemplos', 'Exemplos'], ['lx-recursos', 'Recursos'], ['lx-modelos', 'Modelos'], ['lx-dados', 'Seus dados']].map(([id, t]) => el('a', { href: '#' + id, onclick: go(id), text: t })),
    el('span', { class: 'spacer' }),
    NO_LOGIN ? el('button', { class: 'btn primary sm', onclick: startDemo }, 'Entrar') : el('button', { class: 'btn sm', onclick: startDemo }, 'Ver demonstração'));

  const fileChip = (n, t) => el('span', { class: 'lx-type' }, ic(n, 14), t);
  const hero = el('section', { class: 'lx-hero' },
    el('div', { class: 'lx-hero-txt' },
      el('div', { class: 'lx-pill' }, ic('sparkle', 13), 'Do arquivo ao relatório, sem fórmula'),
      el('h1', { text: 'Planilhas viram decisões' }),
      el('p', { class: 'lx-lead', text: 'Envie a planilha, o extrato do banco ou as notas fiscais que você já tem. O painel arruma os dados, escolhe os gráficos certos, explica cada número em português e entrega relatórios prontos para enviar.' }),
      enterButtons(true),
      el('p', { class: 'lx-small', text: NO_LOGIN ? 'Não precisa de conta: os dados ficam só no seu navegador, nesta aba, e somem ao fechar.' : 'Cada conta vê apenas as próprias planilhas. Usamos só seu nome, e-mail e foto do Google para identificar você.' }),
      el('div', { class: 'lx-types' }, el('small', { text: 'Aceita' }),
        fileChip('sheet', 'Excel e CSV'), fileChip('table', 'Google Sheets'), fileChip('pdf', 'Extrato em PDF'), fileChip('building', 'Extrato OFX'), fileChip('file', 'Nota fiscal XML'), fileChip('image', 'Foto de tabela'))),
    heroWindow());

  const step = (n, i, t, d) => el('li', { class: 'lx-step' }, el('div', { class: 'lx-step-h' }, el('span', { class: 'n', text: n }), el('span', { class: 'lx-ic' }, ic(i, 18))), el('b', { text: t }), el('p', { text: d }));
  const como = el('section', { class: 'lx-sec', id: 'lx-como' },
    el('div', { class: 'lx-sec-h' }, el('div', { class: 'lx-kick', text: 'Como funciona' }), el('h2', { text: 'Três passos, nenhuma fórmula' }),
      el('p', { text: 'Você não precisa montar tabela dinâmica nem escolher tipo de gráfico. O painel olha as colunas e faz isso por você; depois, você ajusta o que quiser.' })),
    el('ol', { class: 'lx-steps' },
      step('01', 'upload', 'Envie um arquivo', 'Arraste o Excel, o CSV, o extrato do banco (PDF ou OFX), o XML das notas fiscais ou até a foto de uma tabela. Excel com várias abas vira uma planilha só, com as abas para escolher.'),
      step('02', 'clean', 'O painel arruma e monta', 'Ele limpa os dados, reconhece o que é data, dinheiro, nome e estado, e monta os gráficos que fazem sentido, cada um com uma explicação curta.'),
      step('03', 'send', 'Use e compartilhe', 'Pergunte aos dados, acompanhe metas e baixe o relatório em PDF, a imagem para o WhatsApp ou a apresentação para a reunião.')));

  const exemplos = el('section', { class: 'lx-sec', id: 'lx-exemplos' },
    el('div', { class: 'lx-sec-h' }, el('div', { class: 'lx-kick', text: 'Veja na prática' }), el('h2', { text: 'O que dá para fazer, com exemplos' }),
      el('p', { text: 'Os exemplos abaixo usam dados fictícios e mostram como cada recurso aparece no painel.' })),
    showcase('1', 'Limpeza automática', 'Arquivo bagunçado entra, tabela certa sai', 'Planilha exportada de sistema costuma vir com sujeira. O painel arruma antes de montar qualquer gráfico e mostra um resumo do que mudou.',
      ['Remove linhas de TOTAL e subtotal, que somariam os valores em dobro', 'Tira cabeçalhos repetidos no meio dos dados e linhas vazias', 'Padroniza nomes escritos de jeitos diferentes, como “ANA SILVA” e “Ana Silva”', 'Transforma “R$ 1.200,00” em número e “N/A” em célula vazia'], exClean()),
    showcase('2', 'Gráficos que se explicam', 'Cada gráfico vem com uma frase dizendo o que ele mostra', 'Nada de gráfico bonito que ninguém entende. Embaixo de cada um, o painel escreve em português quem mais pesou, o que subiu e o que caiu.',
      ['Um destaque por gráfico: a barra que importa em azul, o resto em cinza', 'Filtre por período (este mês, mês passado, 30 dias) e compare com o anterior', 'Clique numa barra para filtrar o painel inteiro', 'Fixe os gráficos que você mais olha no Painel geral, juntando planilhas diferentes'], exCharts(), true),
    showcase('3', 'Perguntas em português', 'Pergunte como você falaria', 'Digite a pergunta e o painel responde com o número e o gráfico. Ele mostra como entendeu, para você conferir, e funciona sem inteligência artificial.',
      ['Entende nomes, meses, “este mês”, “ano passado”, “top 5” e “por vendedor”', 'Usa as colunas e os valores da sua própria planilha', 'Se gostar da resposta, fixe o gráfico no painel'], exAsk()),
    showcase('4', 'Extrato bancário', 'O extrato do banco organizado por categoria', 'Envie o extrato em PDF ou o arquivo OFX que todo banco exporta. Cada lançamento ganha uma categoria e você vê para onde o dinheiro foi.',
      ['Separa entradas e saídas e calcula o resultado de cada mês', 'Categorias como Mercado, Combustível, Moradia e contas, Saúde e Pix', 'Lançamentos repetidos no arquivo entram uma vez só'], exBank(), true),
    showcase('5', 'Notas fiscais', 'XML de NF-e e NFC-e viram uma planilha de itens', 'Selecione os XMLs das notas de uma vez. Cada item vira uma linha, com produto, NCM, CFOP, quantidade e valores, pronto para somar e filtrar.',
      ['Várias notas viram uma planilha só', 'Notas repetidas entram uma vez; cancelamentos e cartas de correção ficam de fora, com aviso', 'Saiba o que mais vendeu ou comprou, por produto, cliente ou estado'], exNfe()),
    showcase('6', 'Metas e alertas', 'Saiba no meio do mês se vai bater a meta', 'Crie metas de faturamento ou limites de gastos. A barra mostra onde você está e um traço mostra onde deveria estar hoje, no ritmo do mês.',
      ['Avisa quando um gasto está correndo mais rápido que o normal', 'Aponta dias e valores fora do padrão', 'Previsão de como o mês deve fechar, pela tendência'], exGoals(), true),
    showcase('7', 'Relatórios e compartilhamento', 'Pronto para mandar para o chefe, o sócio ou o cliente', 'Quando os gráficos estiverem do seu jeito, escolha como levar para frente. Tudo sai com o nome e a cor da sua empresa, se você cadastrar.',
      ['PDF com todos os gráficos e as explicações', 'Imagem de um gráfico do tamanho certo para o WhatsApp', 'Apresentação de slides e os dados limpos em Excel'], exShare()));

  const feat = (n, t, d) => el('div', { class: 'lx-feat' }, el('span', { class: 'lx-ic' }, ic(n, 18)), el('b', { text: t }), el('p', { text: d }));
  const recursos = el('section', { class: 'lx-sec', id: 'lx-recursos' },
    el('div', { class: 'lx-sec-h' }, el('div', { class: 'lx-kick', text: 'Recursos' }), el('h2', { text: 'Tudo o que vem no painel' })),
    el('div', { class: 'lx-feats' },
      feat('upload', 'Qualquer arquivo', 'Excel, CSV, ODS, Google Sheets por link, extratos em PDF ou OFX, XML de notas e fotos de tabelas.'),
      feat('clean', 'Limpeza automática', 'Totais, cabeçalhos repetidos, vazios, nomes escritos de jeitos diferentes e números como texto.'),
      feat('chart', 'Gráficos automáticos', 'Barras, linha, pizza, mapa do Brasil, funil, empilhadas e tabela dinâmica, escolhidos pelas colunas.'),
      feat('search', 'Perguntas livres', 'Pergunte em português e veja a resposta com o gráfico, sem inteligência artificial.'),
      feat('board', 'Painel geral', 'Gráficos de várias planilhas lado a lado numa tela só.'),
      feat('target', 'Metas e alertas', 'Metas e limites no ritmo do mês, valores fora do padrão e previsão de fechamento.'),
      feat('swap', 'Comparar períodos', 'Este mês contra o anterior, com quanto cada número subiu ou caiu.'),
      feat('pdf', 'Relatórios', 'PDF explicado, imagem para WhatsApp, apresentação e Excel, com sua marca.'),
      feat('tv', 'Modo TV', 'Painel em tela cheia para a TV da empresa.'),
      feat('formula', 'Colunas calculadas', 'Crie colunas como lucro e margem a partir das que você já tem.'),
      feat('model', 'Ligar planilhas', 'Junte planilhas por uma coluna em comum, como o código do produto.'),
      feat('database', 'Consulta SQL', 'Para quem sabe SQL: cruze todas as planilhas com uma consulta.'),
      feat('building', 'CNPJ e CEP', 'Complete a planilha com dados públicos de empresas e endereços.'),
      feat('history', 'Histórico de versões', 'Volte para uma versão anterior da planilha se algo der errado.'),
      feat('moon', 'Tema claro e escuro', 'Escolha o tema ou deixe seguir o do seu computador ou celular.'),
      NO_LOGIN ? feat('download', 'Sem cadastro', 'Esta versão funciona sem conta: tudo fica no seu navegador.') : feat('send', 'Link para clientes', 'Compartilhe um painel somente leitura, sem o cliente precisar de conta.')));

  const area = (n, t, d, charts) => el('div', { class: 'lx-area' }, el('div', { class: 'lx-area-h' }, el('span', { class: 'lx-ic' }, ic(n, 18)), el('b', { text: t })), el('p', { text: d }),
    el('ul', {}, ...charts.map(c => el('li', {}, ic('chart', 13), c))));
  const modelos = el('section', { class: 'lx-sec', id: 'lx-modelos' },
    el('div', { class: 'lx-sec-h' }, el('div', { class: 'lx-kick', text: 'Modelos prontos' }), el('h2', { text: 'Um ponto de partida para cada área' }),
      el('p', { text: 'Não tem planilha ainda? Baixe um modelo, preencha e envie. Já tem? Aplique os gráficos do modelo na sua planilha.' })),
    el('div', { class: 'lx-areas' },
      area('chart', 'Vendas', 'Faturamento, produtos, vendedores, clientes e formas de pagamento.', ['Faturamento ao longo do tempo', 'Produtos que mais faturam', 'Ticket médio por vendedor']),
      area('swap', 'Financeiro', 'Entradas e saídas, resultado no tempo, categorias e centros de custo.', ['Entradas x saídas', 'Resultado ao longo do tempo', 'Valores por categoria']),
      area('table', 'Estoque', 'Quantidade e valor parado por produto, categoria e fornecedor.', ['Estoque por produto', 'Produtos com mais dinheiro parado', 'Valor em estoque por fornecedor']),
      area('user', 'Pessoas / RH', 'Quadro por setor e cargo, salários e contratações.', ['Pessoas por setor', 'Salário médio por setor', 'Contratações ao longo do tempo']),
      area('target', 'Marketing', 'Investimento, leads, vendas e receita por canal e campanha.', ['Investimento por canal', 'Leads ao longo do tempo', 'Vendas por campanha'])));

  const trust = (n, t, d) => el('div', { class: 'lx-trust' }, el('span', { class: 'lx-ic' }, ic(n, 18)), el('div', {}, el('b', { text: t }), el('p', { text: d })));
  const dados = el('section', { class: 'lx-sec', id: 'lx-dados' },
    el('div', { class: 'lx-sec-h' }, el('div', { class: 'lx-kick', text: 'Seus dados' }), el('h2', { text: 'Seus arquivos continuam seus' })),
    el('div', { class: 'lx-trusts' },
      trust('upload', 'O arquivo é lido no seu navegador', NO_LOGIN ? 'A planilha é aberta e organizada no seu computador ou celular. Nesta versão nada é enviado para um servidor.' : 'A planilha é aberta e organizada no seu computador ou celular; só a tabela final é guardada na sua conta.'),
      NO_LOGIN ? trust('clock', 'Some quando você fecha', 'Sem conta, os dados ficam só nesta aba. Baixe em Excel ou PDF o que quiser guardar.')
        : trust('user', 'Só você vê', 'Cada conta enxerga apenas as próprias planilhas. Para mostrar a alguém, você cria um link.'),
      trust('download', 'Leve tudo com você', 'Baixe qualquer planilha em Excel quando quiser e exclua o que não usar mais.')));

  const cta = el('section', { class: 'lx-cta' },
    el('h2', { text: 'Comece com uma planilha que você já tem' }),
    el('p', { text: NO_LOGIN ? 'Toque em Entrar: o painel abre com uma planilha de exemplo e você pode enviar os seus arquivos.' : 'Entre com sua conta Google e envie o primeiro arquivo. Se preferir, veja antes uma demonstração com dados fictícios.' }),
    enterButtons(false));

  return el('div', { class: 'lx' }, nav, hero, como, exemplos, recursos, modelos, dados, cta,
    el('footer', { class: 'lx-foot' }, el('span', { text: 'Painel de Planilhas' }), el('span', { text: 'Exemplos desta página com dados fictícios.' })));
}

export { loginScreen };
