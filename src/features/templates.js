import { downloads } from '../app/init.js';
import { modal } from '../app/modals.js';
import { render } from '../app/render.js';
import { AVG_RX, chartKey } from '../charts/auto-charts.js';
import { aggregate, persistCharts } from '../charts/draw-and-pdf.js';
import { S } from '../core/state.js';
import { el, toast, uid8 } from '../core/utils.ts';
import { formModal } from './extras.js';
import { typeOk } from '../views/new-chart.js';

/* ----- Modelos de painel por tipo de negócio ----- */
const R_={
  date:{t:'date'}, money:{t:'number',rx:/valor|total|receita|fatur|venda|pre[cç]o|montante|quantia|amount/i,not:/unit|m[eé]di/i},
  qty:{t:'number',rx:/quantidade|qtd|qtde|unidades/i}, stock:{t:'number',rx:/estoque|quantidade|qtd|saldo|unidades/i,not:/m[ií]nim|m[aá]xim/i},
  stockVal:{t:'number',rx:/valor|custo total|total/i,not:/unit/i}, salary:{t:'number',rx:/sal[aá]rio|remunera|vencimento|custo/i},
  invest:{t:'number',rx:/investimento|custo|gasto|verba|or[cç]amento/i}, leads:{t:'number',rx:/lead|cadastro|contato/i},
  conv:{t:'number',rx:/^vendas$|convers|pedidos|compras/i}, revenue:{t:'number',rx:/receita|faturamento|valor/i},
  product:{t:'text',rx:/produto|item|sku|servi[cç]o|mercadoria/i}, seller:{t:'text',rx:/vendedor|consultor|representante|atendente|respons/i},
  client:{t:'text',rx:/cliente|comprador|raz[aã]o social/i}, category:{t:'text',rx:/categoria|grupo|fam[ií]lia|segmento|linha/i},
  place:{t:'text',rx:/regi[aã]o|cidade|estado|^uf$|loja|filial|unidade|bairro/i}, payment:{t:'text',rx:/pagamento|forma de pag|meio de pag/i},
  kind:{t:'text',rx:/^tipo$|movimento|natureza|entrada|d[eé]bito|cr[eé]dito/i}, center:{t:'text',rx:/centro de custo|^conta|departamento|setor|projeto/i},
  payee:{t:'text',rx:/favorecido|fornecedor|descri|hist[oó]rico|benefici/i}, supplier:{t:'text',rx:/fornecedor|fabricante|marca/i},
  dept:{t:'text',rx:/setor|departamento|[aá]rea|equipe|time/i}, role:{t:'text',rx:/cargo|fun[cç][aã]o|posi[cç][aã]o/i},
  status:{t:'text',rx:/situa[cç][aã]o|status/i}, channel:{t:'text',rx:/canal|origem|m[ií]dia|fonte|plataforma/i}, campaign:{t:'text',rx:/campanha|an[uú]ncio|criativo/i},
  hired:{t:'date',rx:/admiss|contrata/i,fb:true}};
const TEMPLATES=[
  {id:'vendas',name:'Vendas',desc:'Faturamento, produtos, vendedores, clientes e formas de pagamento.',
   headers:['Data','Pedido','Cliente','Produto','Categoria','Quantidade','Valor total','Vendedor','Forma de pagamento','Cidade'],
   charts:[{type:'line',x:'date',y:'money',agg:'sum',title:'Faturamento ao longo do tempo',why:'Mostra quanto foi vendido em cada período.'},
     {type:'hbar',x:'product',y:'money',agg:'sum',title:'Produtos que mais faturam',why:'Ranking dos produtos pela soma das vendas.'},
     {type:'hbar',x:'seller',y:'money',agg:'sum',title:'Ranking de vendedores',why:'Quem mais vendeu no período.'},
     {type:'pie',x:'category',y:'money',agg:'sum',title:'Vendas por categoria',why:'A fatia de cada categoria no faturamento.'},
     {type:'bar',x:'seller',y:'money',agg:'avg',title:'Ticket médio por vendedor',why:'Valor médio de cada venda, por vendedor.'},
     {type:'hbar',x:'client',y:'money',agg:'sum',title:'Maiores clientes',why:'Os clientes que mais compraram.'},
     {type:'pie',x:'payment',y:null,agg:'count',title:'Formas de pagamento',why:'Quantas vendas foram feitas em cada forma de pagamento.'},
     {type:'hbar',x:'place',y:'money',agg:'sum',title:'Vendas por local',why:'Soma das vendas em cada cidade, loja ou região.'}]},
  {id:'financeiro',name:'Financeiro / fluxo de caixa',desc:'Entradas e saídas, resultado no tempo, categorias e centros de custo.',
   headers:['Data','Descrição','Categoria','Tipo','Valor','Conta','Centro de custo'],
   charts:[{type:'bar',x:'kind',y:'money',agg:'sum',abs:true,title:'Entradas x saídas',why:'Compara quanto entrou e quanto saiu.'},
     {type:'line',x:'date',y:'money',agg:'sum',title:'Resultado ao longo do tempo',why:'Mostra o resultado de cada período.'},
     {type:'hbar',x:'category',y:'money',agg:'sum',abs:true,title:'Valores por categoria',why:'Quanto foi movimentado em cada categoria.'},
     {type:'pie',x:'center',y:'money',agg:'sum',abs:true,title:'Participação por centro de custo',why:'A fatia de cada conta ou centro de custo.'},
     {type:'hbar',x:'payee',y:'money',agg:'sum',abs:true,title:'Maiores lançamentos',why:'Descrições ou favorecidos que mais movimentaram dinheiro.'},
     {type:'pie',x:'kind',y:null,agg:'count',title:'Lançamentos por tipo',why:'Quantos lançamentos há de cada tipo.'}]},
  {id:'estoque',name:'Estoque',desc:'Quantidade e valor parado por produto, categoria e fornecedor.',
   headers:['Produto','Código','Categoria','Fornecedor','Quantidade em estoque','Estoque mínimo','Custo unitário','Valor em estoque','Data da última entrada'],
   charts:[{type:'hbar',x:'product',y:'stock',agg:'sum',title:'Estoque por produto',why:'Quantidade disponível de cada produto.'},
     {type:'pie',x:'category',y:'stock',agg:'sum',title:'Estoque por categoria',why:'A fatia de cada categoria no estoque total.'},
     {type:'hbar',x:'product',y:'stockVal',agg:'sum',title:'Produtos com mais dinheiro parado',why:'Produtos com maior valor em estoque.'},
     {type:'hbar',x:'supplier',y:'stockVal',agg:'sum',title:'Valor em estoque por fornecedor',why:'Quanto do estoque vem de cada fornecedor.'},
     {type:'line',x:'date',y:'stock',agg:'sum',title:'Entradas ao longo do tempo',why:'Quantidades por data de entrada.'}]},
  {id:'rh',name:'Pessoas / RH',desc:'Quadro por setor e cargo, salários e contratações.',
   headers:['Nome','Setor','Cargo','Data de admissão','Salário','Situação'],
   charts:[{type:'pie',x:'dept',y:null,agg:'count',title:'Pessoas por setor',why:'Quantas pessoas há em cada setor.'},
     {type:'bar',x:'dept',y:'salary',agg:'avg',title:'Salário médio por setor',why:'Compara o salário médio entre os setores.'},
     {type:'hbar',x:'dept',y:'salary',agg:'sum',title:'Folha por setor',why:'Quanto cada setor representa na folha.'},
     {type:'hbar',x:'role',y:null,agg:'count',title:'Pessoas por cargo',why:'Quantas pessoas há em cada cargo.'},
     {type:'line',x:'hired',y:null,agg:'count',title:'Contratações ao longo do tempo',why:'Quantas pessoas entraram em cada período.'},
     {type:'pie',x:'status',y:null,agg:'count',title:'Situação das pessoas',why:'Quantas pessoas há em cada situação.'}]},
  {id:'marketing',name:'Marketing',desc:'Investimento, leads, vendas e receita por canal e campanha.',
   headers:['Data','Canal','Campanha','Investimento','Cliques','Leads','Vendas','Receita'],
   charts:[{type:'hbar',x:'channel',y:'invest',agg:'sum',title:'Investimento por canal',why:'Onde o dinheiro de mídia foi aplicado.'},
     {type:'hbar',x:'channel',y:'leads',agg:'sum',title:'Leads por canal',why:'Quais canais trazem mais contatos.'},
     {type:'line',x:'date',y:'leads',agg:'sum',title:'Leads ao longo do tempo',why:'A evolução dos contatos gerados.'},
     {type:'bar',x:'campaign',y:'conv',agg:'sum',title:'Vendas por campanha',why:'Quais campanhas mais converteram.'},
     {type:'pie',x:'channel',y:'revenue',agg:'sum',title:'Receita por canal',why:'A fatia de cada canal na receita.'},
     {type:'line',x:'date',y:'invest',agg:'sum',title:'Investimento ao longo do tempo',why:'Quanto foi investido em cada período.'}]}];
function roleCol(cols,key){
  const R=R_[key]; if(!R) return null;
  const ok=c=>c.type===R.t&&(!R.rx||R.rx.test(c.name))&&(!R.not||!R.not.test(c.name))&&!(R.t==='number'&&AVG_RX.test(c.name));
  return (cols.find(ok)||(R.fb?cols.find(c=>c.type===R.t):null))?.name||null;
}
function templateSpecs(meta,tpl,rows){
  const out=[];
  for (const c of tpl.charts){
    const x=roleCol(meta.columns,c.x), y=c.y?roleCol(meta.columns,c.y):'';
    if (!x||y===null||x===y) continue;
    const s={type:c.type,x,y:y||'',agg:y?c.agg:'count',title:c.title,why:c.why}; if(c.abs) s.abs=true;
    if (!typeOk(meta,s.type,x,rows)) continue;
    const r=aggregate(meta,s,rows); if(!r||r.labels.length<2) continue;
    if (out.some(o=>chartKey(o)===chartKey(s))) continue;
    out.push({id:uid8(),...s});
  }
  return out;
}
async function downloadTemplate(tpl){
  const ws=XLSX.utils.aoa_to_sheet([tpl.headers]); ws['!cols']=tpl.headers.map(h=>({wch:Math.max(12,h.length+4)}));
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'Dados');
  const out=XLSX.write(wb,{bookType:'xlsx',type:'array'});
  try{ await downloads.save({filename:`Modelo - ${tpl.name.replace(/[\\/:*?"<>|]/g,'-')}.xlsx`,data:new Blob([out],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})}); toast('Planilha modelo baixada: preencha e envie aqui.'); }
  catch(e){ toast('Download não concluído.',true); }
}
function templatesDialog(meta){
  const rows=meta&&S.rows&&S.currentId===meta.id?S.rows:null;
  const list=el('div',{class:'tpl-grid'});
  const dlg=formModal('Modelos por tipo de negócio',meta&&rows?`Aplique um painel pronto em “${meta.name}”: os gráficos são montados com as colunas que combinam. Ou baixe a planilha modelo para preencher do zero.`:'Baixe a planilha modelo do seu tipo de negócio, preencha com seus dados e envie aqui: os gráficos certos aparecem sozinhos.',list,null,null,'xwide');
  for (const tpl of TEMPLATES){
    const specs=rows?templateSpecs(meta,tpl,rows):[];
    list.append(el('div',{class:'tpl'},
      el('b',{text:tpl.name}),el('p',{text:tpl.desc}),
      el('div',{class:'tpl-cols',text:'Colunas: '+tpl.headers.join(', ')}),
      rows?el('div',{class:'tpl-match'+(specs.length?'':' none'),text:specs.length?`${specs.length} ${specs.length===1?'gráfico combina':'gráficos combinam'} com esta base`:'Nenhum gráfico combina com as colunas desta base'}):null,
      el('div',{class:'tpl-btns'},
        rows&&!S.readOnly?el('button',{class:'btn sm primary',disabled:!specs.length,onclick:()=>{
          const apply=replace=>{ const m=structuredClone(meta); m.charts=replace?specs:[...(m.charts||[]),...specs.filter(s=>!(m.charts||[]).some(c=>chartKey(c)===chartKey(s)))]; dlg.close(); persistCharts(m); S.tab='graficos'; history.replaceState(null,'','#graficos'); render(); toast(`Modelo “${tpl.name}” aplicado.`); };
          if (!(meta.charts||[]).length) return apply(true);
          modal('Aplicar modelo',`Esta base já tem ${meta.charts.length} ${meta.charts.length===1?'gráfico':'gráficos'}. O que fazer com eles?`,null,[{label:'Cancelar'},{label:'Adicionar aos atuais',onclick:()=>apply(false)},{label:'Substituir os atuais',primary:true,onclick:()=>apply(true)}]);
        }},'Aplicar nesta base'):null,
        el('button',{class:'btn sm',onclick:()=>downloadTemplate(tpl)},'Baixar planilha modelo'))));
  }
}

export { R_, TEMPLATES, downloadTemplate, roleCol, templateSpecs, templatesDialog };
