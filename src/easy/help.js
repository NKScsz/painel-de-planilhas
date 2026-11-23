import { icon } from '../app/render.js';
import { S } from '../core/state.js';
import { el } from '../core/utils.ts';
import { LS } from './simple-mode.js';
import { formModal } from '../features/extras.js';
import { TOUR, startTour } from '../features/sample-and-tour.js';

/* ----- Ajuda e tour de cada tela ----- */
const HELP={
  home:{t:'Como usar o painel',items:[
    ['Envie uma planilha','Arraste um arquivo do Excel, CSV, um extrato em PDF ou até a foto de uma tabela. O painel arruma os dados sozinho.'],
    ['Veja os gráficos','Cada planilha ganha gráficos prontos, com uma explicação em português embaixo de cada um.'],
    ['Acompanhe metas','Crie metas (ex.: faturamento do mês) ou limites (ex.: gastos). O painel avisa quando algo sai do ritmo.'],
    ['Envie relatórios','Baixe um PDF pronto ou mande pelo WhatsApp e e-mail com a mensagem já escrita.']]},
  dados:{t:'Aba Dados: a sua planilha',items:[
    ['Busque','Digite qualquer coisa na busca para achar linhas em todas as colunas.'],
    ['Edite','Dê dois cliques numa célula para mudar o valor. Depois toque em “Salvar alterações”.'],
    ['Arrume os dados','“Arrumar dados” acha espaços sobrando, nomes escritos de jeitos diferentes, linhas vazias e repetidas.'],
    ['Mais ferramentas','No botão “••• Mais ferramentas”: colunas com fórmula, versões anteriores, separar lançamentos por categoria e completar dados pelo CNPJ ou CEP.']]},
  graficos:{t:'Aba Gráficos: entenda seus números',items:[
    ['Leia o resumo','O quadro “Resumo em poucas palavras” conta o principal em 2 ou 3 frases.'],
    ['Faça uma pergunta','Toque numa das perguntas prontas: o gráfico certo aparece, com a resposta explicada.'],
    ['Escolha o período','Use “Este mês”, “Mês passado”… para ver só aquele período e comparar com o anterior.'],
    ['Toque nos gráficos','Tocar numa barra ou fatia filtra o painel inteiro por ela. Embaixo de cada gráfico há uma explicação.']]},
  relatorios:{t:'Aba Relatórios: envie os resultados',items:[
    ['Crie um relatório','Escolha quais gráficos entram, o período e para quem enviar.'],
    ['Envie na hora','“Enviar no WhatsApp” e “Enviar agora” abrem a mensagem pronta; o PDF é baixado para você anexar.'],
    ['Reaproveite','O relatório fica salvo: no mês que vem é só abrir e enviar de novo, com os dados novos.']]},
  apresentacao:{t:'Aba Apresentação: slides prontos',items:[
    ['Ajuste o texto','Coloque o título, o subtítulo e, se quiser, o nome do cliente.'],
    ['Escolha o período e o visual','Os slides usam os gráficos desta planilha. Dá para escolher o fundo claro ou escuro.'],
    ['Baixe','Baixe em PowerPoint (para editar) ou em PDF (para enviar).']]}};
const TOURS={
  dados:[{sel:'.search',t:'Busca',d:'Digite qualquer palavra ou número para achar as linhas em todas as colunas.'},
    {sel:'[data-tour="clean"]',t:'Arrumar dados',d:'Corrige espaços sobrando, nomes escritos de jeitos diferentes, números guardados como texto e linhas repetidas.'},
    {sel:'[data-tour="tools"]',t:'Mais ferramentas',d:'Colunas com fórmula (lucro, margem…), versões anteriores da planilha, separar lançamentos por categoria e completar dados pelo CNPJ ou CEP.'},
    {sel:'.table-card',t:'A tabela',d:'Toque no nome de uma coluna para ordenar. Dois cliques numa célula editam o valor.'}],
  relatorios:[{sel:'.rep-top',t:'Relatórios prontos',d:'Monte um relatório uma vez e envie sempre que quiser, com os dados atualizados.'},
    {sel:'.rep-card .whats, .rep-empty .btn',t:'Enviar',d:'Abre o WhatsApp ou o e-mail com a mensagem pronta e baixa o PDF para anexar.'}],
  apresentacao:[{sel:'.deck-form',t:'Monte os slides',d:'Mude título, período e visual. A prévia ao lado mostra como vai ficar.'},
    {sel:'.deck-slides',t:'Prévia',d:'Cada gráfico vira um slide com o título e os números. Baixe em PowerPoint ou PDF.'}]};
function helpBar(key){
  return el('div',{class:'help-line'},el('button',{class:'help-btn',type:'button',onclick:()=>helpDialog(key)},icon('help'),'Como usar esta tela'));
}
function helpDialog(key){
  const h=HELP[key]; if(!h) return;
  const list=el('ol',{class:'help-list'},h.items.map(([b,d],i)=>el('li',{},el('span',{class:'n',text:String(i+1)}),el('span',{},el('b',{text:b+'. '}),d))));
  const steps=key==='graficos'?TOUR:TOURS[key];
  const tourBtn=steps&&key!=='home'?el('button',{class:'btn',style:'margin-top:16px',onclick:()=>{ dlg.close(); setTimeout(()=>startTour(steps),150); }},'Mostrar na tela, passo a passo'):null;
  const dlg=formModal(h.t,null,el('div',{},list,tourBtn),null,null);
}
// tour curto na primeira vez que a pessoa abre cada aba
function autoTour(key){
  if (S.readOnly||S.mode==='share'||LS.get('tour_'+key)==='1'||document.querySelector('.tour,.modal-bg')) return;
  const steps=key==='graficos'?TOUR:TOURS[key]; if(!steps) return;
  LS.set('tour_'+key,'1');
  setTimeout(()=>{ if(!document.querySelector('.tour,.modal-bg')&&S.tab===key&&S.view==='base') startTour(steps); },900);
}

export { HELP, TOURS, autoTour, helpBar, helpDialog };
