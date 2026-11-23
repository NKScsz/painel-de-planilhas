import { aggregate } from './draw-and-pdf.js';
import { isUfCol } from './extra-types.js';
import { uid8 } from '../core/utils.ts';
import { CODE_RX } from '../core/values.ts';
import { TEMPLATES, templateSpecs } from '../features/templates.js';

/* ============ Gráficos automáticos ============ */
function distinctCount(rows,j,cap=60){ const s=new Set(); for(const r of rows){ if(r[j]!=null&&r[j]!=='') s.add(r[j]); if(s.size>cap) break; } return s.size; }
function isTimeCol(rows,j){ let n=0,m=0; for(const r of rows){ const v=r[j]; if(v==null||v==='') continue; n++; if(/^\d{1,2}:\d{2}(:\d{2})?$/.test(String(v).trim())) m++; if(n>=400) break; } return n>0&&m/n>=0.85; }
const MEAS_RX=/valor|total|receita|fatur|venda|pre[cç]o|custo|despesa|lucro|montante|quantia|amount|pago|recebido|quantidade|qtd/i;
// números que não fazem sentido somar (preço unitário, percentuais, taxas, idade, notas): usam média
const AVG_RX=/unit[aá]ri|pre[cç]o m[eé]dio|%|percent|taxa (de )?(juros|convers|c[aâ]mbio|crescimento|ocupa)|margem|(^|[\s_(])idade\b|^nota$|avalia[cç]|m[eé]dia|score|temperatura|cota[cç][aã]o|^pre[cç]o$|capital social/i;
const PARTY_RX=/origem|destino|favorecido|benefici|pagador|recebedor|cliente|fornecedor|nome|estabelecimento|descri|hist[oó]rico|vendedor|produto/i;
const chartKey=s=>`${s.type}|${s.x}|${s.y||''}|${s.agg}|${s.filter?s.filter.col+'='+s.filter.val:''}|${s.abs?1:0}`;
/* Escolhe gráficos que fazem sentido para o tipo de dado:
   - extrato/financeiro (coluna Movimento + valor): entradas x saídas, resultado no tempo, horários, quem mais pagou/recebeu
   - geral: evolução no tempo, participação (poucas categorias), ranking (muitas), média por grupo
   Gráficos que ficariam vazios ou com 1 barra só são descartados. */
function autoCharts(columns,rows,limit=9){
  const meta={columns}, out=[]; let mapCol=null;
  const add=s=>{
    if (out.length>=limit||out.some(o=>chartKey(o)===chartKey(s))) return;
    if (mapCol&&s.x===mapCol&&s.type!=='map'&&s.type!=='pivot') return; // estado já aparece no mapa
    const r=aggregate(meta,s,rows); if(!r||r.labels.length<(s.min||2)) return;
    if ((s.type==='stacked'||s.type==='pivot')&&s.series&&!(r.stack&&r.stack.series.length>=2)) return; // dividir por algo que não divide
    if (s.type==='pivot'&&r.pivot&&r.pivot.rows.length<3) return;
    delete s.min; out.push({id:uid8(),...s});
  };
  // medidas: dinheiro primeiro, depois quantidades; ignora saldo, ano/mês e números que são códigos (pedido, nº, id…)
  const isCodeNum=(c,i)=>/(^id\b|pedido|n[uú]mero|c[oó]digo|^n[ºo°.]|nota|matr[ií]cula)/i.test(c.name)||(()=>{ const j=columns.indexOf(c); const v=rows.map(r=>r[j]).filter(x=>typeof x==='number'); return v.length>10&&v.every(Number.isInteger)&&new Set(v).size===v.length; })();
  const prio=n=>/valor|total|receita|fatur|venda|pre[cç]o|custo|despesa|lucro|montante|quantia|amount|pago|recebido/i.test(n)?0:/quantidade|qtd/i.test(n)?1:2;
  const nums=columns.map((c,i)=>({c,i})).filter(({c,i})=>c.type==='number'&&!/saldo/i.test(c.name)&&!/^(ano|m[eê]s|dia|idade|year|month)$/i.test(c.name)&&!AVG_RX.test(c.name)&&!isCodeNum(c,i))
    .sort((a,b)=>prio(a.c.name)-prio(b.c.name)||a.i-b.i).map(o=>o.c);
  const y=nums[0]?.name||'', agg=y?'sum':'count';
  const yj=y?columns.findIndex(c=>c.name===y):-1;
  const yNeg=yj>=0&&rows.some(r=>typeof r[yj]==='number'&&r[yj]<0);
  const date=columns.find(c=>c.type==='date');
  const tj=columns.findIndex((c,j)=>c.type==='text'&&isTimeCol(rows,j)); const time=tj>=0?columns[tj]:null;
  const cats=columns.map((c,j)=>({c,j})).filter(({c,j})=>c.type==='text'&&j!==tj&&!CODE_RX.test(c.name)&&!/(pedido|n[uú]mero|protocolo|^id\b|chave|transa[cç][aã]o)/i.test(c.name))
    .map(({c,j})=>{ let filled=0; for(const r of rows) if(r[j]!=null&&r[j]!=='') filled++; return {c,j,n:distinctCount(rows,j,500),filled}; })
    .filter(o=>o.n>=2&&o.filled>=rows.length*0.3);
  const mov=cats.find(o=>/^movimento$/i.test(o.c.name));
  const rest=cats.filter(o=>o!==mov);
  const party=rest.filter(o=>PARTY_RX.test(o.c.name)).sort((a,b)=>b.n-a.n)[0]||rest.filter(o=>o.n>8).sort((a,b)=>b.n-a.n)[0];
  const small=rest.filter(o=>o!==party&&o.n<=8);
  const mid=rest.filter(o=>o!==party&&o.n>8);

  if (mov&&y){ // extrato bancário / fluxo de caixa
    const E={col:mov.c.name,val:'Entrada'}, Sd={col:mov.c.name,val:'Saída'};
    if (date) add({type:'stacked',x:date.name,y,agg:'sum',abs:true,series:mov.c.name,wide:true,title:'Entradas e saídas em cada período',why:'Compara, período a período, quanto entrou e quanto saiu: dá para ver em quais períodos o caixa apertou.',min:2});
    add({type:'bar',x:mov.c.name,y,agg:'sum',abs:true,title:'Entradas x saídas',why:'Compara quanto dinheiro entrou e quanto saiu no período.'});
    const catc=rest.find(o=>/^categoria$/i.test(o.c.name));
    if (catc) add({type:'hbar',x:catc.c.name,y,agg:'sum',abs:true,filter:Sd,title:'Gastos por categoria',why:'Mostra em que tipo de despesa o dinheiro foi gasto (com a fatia de cada uma no total).'});
    if (date) add({type:'line',x:date.name,y,agg:'sum',forecast:true,title:'Resultado ao longo do tempo',why:'Mostra o resultado líquido (entradas menos saídas) em cada período, com a tendência para os próximos.',min:3});
    if (catc&&date) add({type:'pivot',x:catc.c.name,y,agg:'sum',series:mov.c.name,wide:true,title:'Tabela: categorias × entradas e saídas',why:'Quanto cada categoria movimentou em entradas e em saídas (saídas com sinal negativo) e o resultado de cada uma.'});
    if (time) add({type:'bar',x:time.name,y,agg:'sum',filter:E,title:'Entradas por horário',why:'Mostra em que horários do dia mais entra dinheiro.',min:3});
    if (party){
      add({type:'hbar',x:party.c.name,y,agg:'sum',filter:E,title:'Quem mais gerou entradas',why:`Ranking de "${party.c.name}" pela soma dos valores recebidos.`});
      add({type:'hbar',x:party.c.name,y,agg:'sum',abs:true,filter:Sd,title:'Para onde foram as saídas',why:`Ranking de "${party.c.name}" pela soma dos valores pagos ou enviados.`});
    }
    for (const o of small) add({type:'pie',x:o.c.name,y:'',agg:'count',title:`Transações por ${o.c.name}`,why:`Mostra quantas transações há de cada "${o.c.name}".`});
    add({type:'pie',x:mov.c.name,y:'',agg:'count',title:'Quantidade de entradas e saídas',why:'Mostra quantas transações foram de entrada e quantas de saída.'});
    if (out.length>=3) return out;
  }
  /* Ordem pensada para contar a história da base: evolução (com tendência) -> evolução dividida pela categoria
     principal -> painel do tipo de negócio -> mapa -> ranking -> participação -> cruzamentos (empilhadas e
     tabela dinâmica) -> médias. Gráficos de tempo e tabelas ocupam a largura toda para caber mais detalhe. */
  const ufc=cats.find(o=>isUfCol(rows,o.j)); // coluna de estado: vira mapa do Brasil (sem repetir em barras/rosca)
  const stage=cats.find(o=>/etapa|est[aá]gio|fase|funil|pipeline/i.test(o.c.name)&&o.n>=3&&o.n<=8); // etapas: funil
  const ranks=[party,...mid].filter(Boolean).filter(o=>o.n<=rows.length*(y?0.95:0.8)) // valores que quase nunca se repetem não formam ranking
    .sort((a,b)=>(a.n>60)-(b.n>60)||a.n-b.n); // primeiro colunas com número moderado de itens (produto, vendedor…), depois as muito variadas (clientes)
  // melhor coluna para "dividir por": poucas categorias (de preferência 3 a 6), sem ser estado nem etapa
  const split=[...small].filter(o=>o!==stage).sort((a,b)=>(a===ufc)-(b===ufc)||((b.n>=3&&b.n<=6)-(a.n>=3&&a.n<=6))||a.n-b.n)[0];
  const mainCat=ranks.find(o=>o!==split&&o!==ufc)||small.find(o=>o!==split&&o!==ufc&&o!==stage);
  const ys=yNeg?'':y, aggS=ys?'sum':'count';
  if (date){
    add({type:'line',x:date.name,y,agg,forecast:true,wide:true,title:y?`Evolução de ${y}`:'Registros ao longo do tempo',why:y?`Mostra como a soma de "${y}" varia ao longo do tempo, com a linha de tendência e uma estimativa dos próximos períodos.`:`Mostra quantos registros existem em cada período de "${date.name}", com a tendência para os próximos.`,min:3});
    if (split) add({type:'stacked',x:date.name,y:ys,agg:aggS,series:split.c.name,wide:true,title:ys?`${ys} por ${split.c.name} ao longo do tempo`:`Registros por ${split.c.name} ao longo do tempo`,why:`Cada período dividido por "${split.c.name}": mostra quem puxou a alta ou a queda em cada momento.`,min:3});
  }
  if (ufc){ mapCol=ufc.c.name; add({type:'map',x:ufc.c.name,y:ys,agg:aggS,skipEmpty:true,title:ys?`${ys} por estado`:'Registros por estado',why:'Mostra no mapa do Brasil como os valores se distribuem entre os estados.'}); }
  if (!mov){ const n0=out.length; let best=[]; for(const tpl of TEMPLATES){ const s=templateSpecs(meta,tpl,rows); if(s.length>best.length) best=s; }
    if (best.length>=3) for(const s of best){ if(out.length-n0>=3) break; add({...s}); } }
  if (time) add({type:'bar',x:time.name,y,agg,title:y?`${y} por horário`:'Registros por horário',why:'Mostra em que horas do dia há mais movimento.',min:3});
  if (stage) add({type:'funnel',x:stage.c.name,y:'',agg:'count',title:`Funil por ${stage.c.name}`,why:`Quantos registros há em cada etapa de "${stage.c.name}" e quanto se perde de uma etapa para a outra.`});
  if (ranks[0]) add({type:'hbar',x:ranks[0].c.name,y,agg,title:`Ranking de ${ranks[0].c.name}`,why:y?`Os itens de "${ranks[0].c.name}" com maior soma de "${y}", com a fatia de cada um no total.`:`Os itens de "${ranks[0].c.name}" que mais aparecem.`});
  if (small[0]) add({type:'pie',x:small[0].c.name,y:ys,agg:aggS,title:`Participação por ${small[0].c.name}`,why:ys?`Mostra a fatia de cada "${small[0].c.name}" no total de "${ys}".`:`Mostra quantos registros há de cada "${small[0].c.name}".`});
  if (mainCat&&split&&mainCat!==split){
    add({type:'stacked',x:mainCat.c.name,y:ys,agg:aggS,series:split.c.name,title:`${mainCat.c.name} por ${split.c.name}`,why:`Cada barra de "${mainCat.c.name}" dividida por "${split.c.name}": mostra a composição de cada um.`});
    add({type:'pivot',x:mainCat.c.name,y:ys,agg:aggS,series:split.c.name,wide:true,title:`Tabela: ${mainCat.c.name} × ${split.c.name}`,why:`Os números exatos de cada "${mainCat.c.name}" em cada "${split.c.name}", com totais e participação.`});
  }
  if (y){ const o=[...small,...mid].find(o=>o.n<=20); if(o) add({type:'bar',x:o.c.name,y,agg:'avg',title:`Média de ${y} por ${o.c.name}`,why:`Compara o valor médio (ex.: ticket médio) de cada "${o.c.name}".`}); }
  for (const o of ranks.slice(1)) add({type:'hbar',x:o.c.name,y,agg,title:`Ranking de ${o.c.name}`,why:y?`Os itens de "${o.c.name}" com maior soma de "${y}", com a fatia de cada um no total.`:`Os itens de "${o.c.name}" que mais aparecem.`});
  for (const o of small.slice(1)) add({type:'pie',x:o.c.name,y:ys,agg:aggS,title:`Participação por ${o.c.name}`,why:ys?`Mostra a fatia de cada "${o.c.name}" no total de "${ys}".`:`Mostra quantos registros há de cada "${o.c.name}".`});
  if (nums[1]){ const o=small[0]||mid[0]||party; if(o) add({type:'hbar',x:o.c.name,y:nums[1].name,agg:'sum',title:`${nums[1].name} por ${o.c.name}`,why:`Soma de "${nums[1].name}" em cada "${o.c.name}".`}); }
  if (!out.length&&columns[0]) out.push({id:uid8(),type:'hbar',x:columns[0].name,y:'',agg:'count',title:`Registros por ${columns[0].name}`,why:`Mostra quantos registros há de cada "${columns[0].name}".`});
  return out;
}

export { AVG_RX, MEAS_RX, PARTY_RX, autoCharts, chartKey, distinctCount, isTimeCol };
