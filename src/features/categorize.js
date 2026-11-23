import { render } from '../app/render.js';
import { distinctCount, isTimeCol } from '../charts/auto-charts.js';
import { pct1 } from '../charts/draw-and-pdf.js';
import { S } from '../core/state.js';
import { handleWriteError, saveBase } from '../core/storage.js';
import { el, nf, toast, uid8 } from '../core/utils.ts';
import { fld, fold, formModal } from './extras.js';

/* ----- Categorização automática de lançamentos (extratos) ----- */
const CAT_RULES=[
  ['Salário e renda',[' salario',' folha pag',' pro labore',' prolabore',' provento',' rendimento',' dividendo',' restituicao',' decimo terceiro']],
  ['Fatura do cartão',[' fatura',' pagamento cartao',' pgto cartao',' pag cartao',' cartao de credito']],
  ['Impostos e tarifas',[' tarifa',' iof ',' juros',' multa',' anuidade',' das ',' darf',' gps ',' imposto',' encargo',' cesta de servic',' pacote de servic',' ipva',' iptu',' licenciamento',' detran',' taxa ']],
  ['Investimentos',[' aplicacao',' resgate',' cdb',' tesouro',' poupanca',' investimento',' corretora',' lci ',' lca ']],
  ['Assinaturas',[' netflix',' spotify',' prime video',' amazon prime',' disney',' hbo',' youtube',' apple com',' apple bill',' google play',' google one',' deezer',' globoplay',' icloud',' microsoft',' adobe',' canva',' chatgpt',' openai',' paramount',' crunchyroll']],
  ['Compras',[' amazon',' mercado livre',' mercadolivre',' mercado pago',' mercadopago',' shopee',' magalu',' magazine luiza',' americanas',' aliexpress',' shein',' casas bahia',' renner',' riachuelo',' zara',' centauro',' netshoes',' kabum',' leroy',' havan']],
  ['Mercado',[' supermercado',' mercado ',' mercadinho',' atacad',' assai',' carrefour',' pao de acucar',' hortifruti',' sacolao',' acougue',' sams club',' makro']],
  ['Alimentação',[' ifood',' ifd ',' rappi',' restaurante',' lanchonete',' lanches',' padaria',' panificadora',' pizzaria',' pizza',' burger',' mc donald',' mcdonald',' subway',' habib',' outback',' cafe ',' cafeteria',' starbucks',' acai',' sorvet',' churrasc',' delivery',' food',' bar ',' boteco',' cantina',' sushi',' esfiha',' pastel']],
  ['Transporte',[' uber',' 99 ',' 99app',' 99pop',' cabify',' taxi',' metro ',' onibus',' bilhete unico',' estacionamento',' estapar',' pedagio',' sem parar',' veloe',' conectcar',' cptm']],
  ['Combustível',[' posto',' combust',' shell',' ipiranga',' petrobras',' br mania',' gasolina',' etanol',' diesel']],
  ['Saúde',[' farmacia',' drogaria',' droga raia',' drogasil',' raia ',' pacheco',' pague menos',' panvel',' hospital',' clinica',' laborat',' medic',' odonto',' dentista',' unimed',' amil',' hapvida',' sulamerica',' plano de saude',' psicolog',' fisioter',' academia',' smart fit',' smartfit',' gympass',' wellhub']],
  ['Moradia e contas',[' aluguel',' condominio',' energia',' enel',' cemig',' light ',' copel',' celesc',' coelba',' neoenergia',' equatorial',' cpfl',' sabesp',' caesb',' cedae',' copasa',' sanepar',' embasa',' agua ',' conta de gas',' comgas',' ultragaz',' internet',' vivo',' claro',' tim ',' sky ']],
  ['Educação',[' escola',' colegio',' faculdade',' universidade',' curso',' udemy',' alura',' livraria',' mensalidade',' material escolar',' hotmart']],
  ['Lazer e viagem',[' cinema',' cinemark',' ingresso',' sympla',' hotel',' pousada',' airbnb',' booking',' latam',' gol linhas',' azul linhas',' decolar',' 123milhas',' viagem',' passagem',' turismo']],
  ['Saques',[' saque']],
  ['Transferências e Pix',[' pix',' ted ',' doc ',' transf']]];
function categorize(desc){
  const s=' '+fold(desc).replace(/[^a-z0-9]+/g,' ').trim()+' ';
  if (s.trim()==='') return null;
  for (const [cat,kws] of CAT_RULES) if (kws.some(k=>s.includes(k))) return cat;
  return 'Outros';
}
const DESC_RX=/descri|hist[oó]rico|estabelecimento|lan[cç]amento|detalhe|memo|favorecido|benefici|origem|destino|nome|identifica/i;
function descColumn(columns,rows){
  const c=columns.map((c,j)=>({c,j})).filter(({c,j})=>c.type==='text'&&!/^(movimento|categoria)$/i.test(c.name)&&!isTimeCol(rows,j));
  return (c.find(o=>/descri|hist[oó]rico|estabelecimento|lan[cç]amento/i.test(o.c.name))||c.find(o=>DESC_RX.test(o.c.name))||c.sort((a,b)=>distinctCount(rows,b.j,500)-distinctCount(rows,a.j,500))[0])?.j??-1;
}
// extratos lidos de PDF/imagem: cria a coluna "Categoria" quando dá para reconhecer boa parte dos lançamentos
function categorizeTable(t){
  if (t.columns.some(c=>/^categoria$/i.test(c.name))) return;
  const j=descColumn(t.columns,t.rows); if(j<0) return;
  const cats=t.rows.map(r=>categorize(r[j])), known=cats.filter(c=>c&&c!=='Outros').length;
  if (t.rows.length<3||known<t.rows.length*0.25) return;
  t.columns.splice(j+1,0,{name:'Categoria',type:'text'});
  t.rows=t.rows.map((r,i)=>{ const a=r.slice(); a.splice(j+1,0,cats[i]); return a; });
}
function categorizeDialog(meta){
  const texts=meta.columns.map((c,j)=>({c,j})).filter(({c})=>c.type==='text'&&!c.virtual&&!/^categoria$/i.test(c.name));
  if (!texts.length){ toast('Esta base não tem coluna de texto com a descrição dos lançamentos.',true); return; }
  const dj=descColumn(meta.columns,S.rows);
  const sel=el('select',{},texts.map(({c,j})=>el('option',{value:String(j),text:c.name}))); sel.value=String(dj>=0?dj:texts[0].j);
  const existing=meta.columns.findIndex(c=>/^categoria$/i.test(c.name));
  const prev=el('div',{class:'cat-prev'}), err=el('div',{class:'form-err'});
  let cats=[];
  const draw=()=>{
    const j=+sel.value; cats=S.rows.map(r=>categorize(r[j])); prev.innerHTML='';
    const g=new Map(); cats.forEach((c,i)=>{ if(!c) return; let o=g.get(c); if(!o){ o={n:0,ex:[]}; g.set(c,o); } o.n++; const ex=String(S.rows[i][j]??'').slice(0,40); if(o.ex.length<3&&ex&&!o.ex.includes(ex)) o.ex.push(ex); });
    const list=[...g.entries()].sort((a,b)=>(a[0]==='Outros')-(b[0]==='Outros')||b[1].n-a[1].n);
    const known=cats.filter(c=>c&&c!=='Outros').length;
    prev.append(el('div',{class:'muted',style:'font-size:12.5px;margin-bottom:8px',text:`${nf.format(known)} de ${nf.format(S.rows.length)} lançamentos reconhecidos (${pct1(S.rows.length?known/S.rows.length*100:0)}). Os demais ficam em “Outros” e você pode ajustar na tabela.`}),
      el('table',{class:'data mini'},el('thead',{},el('tr',{},el('th',{text:'Categoria'}),el('th',{class:'num',text:'Lançamentos'}),el('th',{text:'Exemplos'}))),
        el('tbody',{},list.map(([c,o])=>el('tr',{},el('td',{text:c}),el('td',{class:'num',text:nf.format(o.n)}),el('td',{class:'muted',text:o.ex.join(' · ')}))))));
  };
  sel.onchange=draw; draw();
  formModal('Categorizar lançamentos','Classifica cada lançamento pela descrição (mercado, alimentação, transporte, contas, Pix…) e cria a coluna “Categoria”, com um gráfico de gastos por categoria.',
    el('div',{},fld('Coluna com a descrição',sel),existing>=0?el('p',{class:'doc-warn',text:'Esta base já tem uma coluna “Categoria”: os valores dela serão substituídos.'}):null,prev,err),
    'Criar coluna Categoria',async()=>{
      const m=structuredClone(meta); let ci=m.columns.findIndex(c=>/^categoria$/i.test(c.name));
      let rows;
      if (ci>=0){ m.columns[ci].type='text'; rows=S.rows.map((r,i)=>{ const a=r.slice(); a[ci]=cats[i]; return a; }); }
      else { m.columns.push({name:'Categoria',type:'text'}); ci=m.columns.length-1; rows=S.rows.map((r,i)=>[...r,cats[i]]); }
      const cname=m.columns[ci].name;
      if (!(m.charts||[]).some(c=>c.x===cname)){
        const nums=m.columns.filter(c=>c.type==='number'), y=(nums.find(c=>/valor|vlr|montante|quantia|amount/i.test(c.name))||nums[0])?.name||'';
        const mov=m.columns.find(c=>/^movimento$/i.test(c.name));
        const spec=mov&&y?{type:'hbar',x:cname,y,agg:'sum',abs:true,filter:{col:mov.name,val:'Saída'},title:'Gastos por categoria',why:'Mostra em que tipo de despesa o dinheiro foi gasto.'}
          :{type:'hbar',x:cname,y,agg:y?'sum':'count',abs:!!y,title:'Valores por categoria',why:'Mostra quanto foi movimentado em cada categoria.'};
        (m.charts=m.charts||[]).unshift({id:uid8(),...spec});
      }
      const t=toast('Salvando…',false,60000);
      try{ await saveBase(m,rows); S.rows=rows; S.dirty=false; t.remove(); toast('Coluna “Categoria” criada. Ajuste o que precisar direto na tabela.'); render(); }
      catch(e){ t.remove(); handleWriteError(e); return false; }
    },'wide');
}

export { CAT_RULES, DESC_RX, categorize, categorizeDialog, categorizeTable, descColumn };
