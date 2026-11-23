import { leaveProfile } from '../app/init.js';
import { icon, render } from '../app/render.js';
import { chartKey } from '../charts/auto-charts.js';
import { PDFC, aggregate, pdfTxt, savePdf } from '../charts/draw-and-pdf.js';
import { S } from '../core/state.js';
import { handleWriteError, saveBase } from '../core/storage.js';
import { $, el, fmtDate, fmtWhen, nf, toast, uid8 } from '../core/utils.ts';
import { parseNum } from '../core/values.ts';
import { brand, hexRgb, lum } from './brand.js';
import { fld, fold, formModal, pDate } from './extras.js';
import { pdfReady } from '../views/reports-tab.js';

/* ----- Consultas (CNPJ e CEP) e enriquecimento de bases -----
   Dados públicos da Receita Federal (CNPJ) e dos Correios (CEP), consultados direto do navegador em APIs
   abertas: BrasilAPI (principal), publica.cnpj.ws e ViaCEP (reserva). Sem custo e sem servidor.
   Dados de pessoas físicas (CPF), score de crédito e placas não são consultados: exigem fornecedores pagos
   autorizados e base legal (LGPD). Para CPF o site só confere se o número é válido. */
const onlyDigits=s=>String(s??'').replace(/\D/g,'');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function cnpjOk(c){ c=onlyDigits(c); if(c.length!==14||/^(\d)\1+$/.test(c)) return false;
  const dv=n=>{ let s=0,p=n-7; for(let i=0;i<n;i++){ s+=+c[i]*p--; if(p<2) p=9; } const r=s%11; return r<2?0:11-r; };
  return dv(12)===+c[12]&&dv(13)===+c[13]; }
function cpfOk(c){ c=onlyDigits(c); if(c.length!==11||/^(\d)\1+$/.test(c)) return false;
  for (const n of [9,10]){ let s=0; for(let i=0;i<n;i++) s+=+c[i]*(n+1-i); if((s*10)%11%10!==+c[n]) return false; } return true; }
const fmtCnpj=c=>{ c=onlyDigits(c).padStart(14,'0'); return `${c.slice(0,2)}.${c.slice(2,5)}.${c.slice(5,8)}/${c.slice(8,12)}-${c.slice(12)}`; };
const fmtCepTxt=c=>{ c=onlyDigits(c).padStart(8,'0'); return `${c.slice(0,5)}-${c.slice(5)}`; };
const titleCase=s=>String(s||'').toLowerCase().replace(/(^|[\s/(-])(\p{L})/gu,(m,a,b)=>a+b.toUpperCase()).replace(/\b(De|Da|Do|Das|Dos|E|Em|Com|Para)\b/g,w=>w.toLowerCase());
const fmtPhoneBr=s=>{ const d=onlyDigits(s); if(d.length<10) return d||''; return `(${d.slice(0,2)}) ${d.slice(2,d.length-4)}-${d.slice(-4)}`; };
async function getJson(u){
  const r=await fetch(u,{headers:{Accept:'application/json'}});
  if (r.status===404||r.status===400) return null;
  if (!r.ok){ const e=new Error('http '+r.status); e.retry=r.status===429||r.status>=500; throw e; }
  return r.json();
}
function cnpjFromBrasil(j){
  return {cnpj:j.cnpj,razao:j.razao_social||'',fantasia:j.nome_fantasia||'',situacao:titleCase(j.descricao_situacao_cadastral),dataSituacao:j.data_situacao_cadastral||'',
    abertura:j.data_inicio_atividade||'',tipo:titleCase(j.descricao_identificador_matriz_filial),porte:titleCase(j.porte||''),natureza:j.natureza_juridica||'',
    cnae:j.cnae_fiscal?String(j.cnae_fiscal):'',cnaeDesc:j.cnae_fiscal_descricao||'',secundarios:(j.cnaes_secundarios||[]).filter(x=>x&&x.codigo).map(x=>({codigo:String(x.codigo),descricao:x.descricao})),
    capital:typeof j.capital_social==='number'?j.capital_social:parseNum(j.capital_social),
    logradouro:[j.descricao_tipo_de_logradouro&&!String(j.logradouro||'').toUpperCase().startsWith(String(j.descricao_tipo_de_logradouro).toUpperCase())?j.descricao_tipo_de_logradouro:'',j.logradouro].filter(Boolean).join(' '),
    numero:j.numero||'',complemento:j.complemento||'',bairro:j.bairro||'',municipio:titleCase(j.municipio),uf:j.uf||'',cep:j.cep||'',
    telefone:fmtPhoneBr(j.ddd_telefone_1),email:(j.email||'').toLowerCase(),simples:j.opcao_pelo_simples===true?'Sim':j.opcao_pelo_simples===false?'Não':'',mei:j.opcao_pelo_mei===true?'Sim':j.opcao_pelo_mei===false?'Não':'',
    socios:(j.qsa||[]).map(s=>({nome:s.nome_socio,qualificacao:s.qualificacao_socio,entrada:s.data_entrada_sociedade||'',faixa:s.faixa_etaria||''})),fonte:'BrasilAPI (Receita Federal)'};
}
function cnpjFromWs(j){
  const e=j.estabelecimento||{};
  return {cnpj:e.cnpj,razao:j.razao_social||'',fantasia:e.nome_fantasia||'',situacao:titleCase(e.situacao_cadastral),dataSituacao:e.data_situacao_cadastral||'',abertura:e.data_inicio_atividade||'',
    tipo:titleCase(e.tipo),porte:titleCase(j.porte?.descricao),natureza:j.natureza_juridica?.descricao||'',cnae:e.atividade_principal?.subclasse||e.atividade_principal?.id||'',cnaeDesc:e.atividade_principal?.descricao||'',
    secundarios:(e.atividades_secundarias||[]).map(x=>({codigo:x.subclasse||x.id,descricao:x.descricao})),capital:parseNum(j.capital_social),
    logradouro:[e.tipo_logradouro,e.logradouro].filter(Boolean).join(' '),numero:e.numero||'',complemento:e.complemento||'',bairro:e.bairro||'',municipio:titleCase(e.cidade?.nome),uf:e.estado?.sigla||'',cep:e.cep||'',
    telefone:fmtPhoneBr((e.ddd1||'')+(e.telefone1||'')),email:(e.email||'').toLowerCase(),simples:j.simples?(j.simples.simples==='Sim'?'Sim':'Não'):'',mei:j.simples?(j.simples.mei==='Sim'?'Sim':'Não'):'',
    socios:(j.socios||[]).map(s=>({nome:s.nome,qualificacao:s.qualificacao_socio?.descricao||'',entrada:s.data_entrada||'',faixa:s.faixa_etaria||''})),fonte:'CNPJ.ws (Receita Federal)'};
}
const cnpjCache=new Map(), cepCache=new Map();
// {notFound} quando a Receita não tem o CNPJ; {error} quando nenhum serviço respondeu (tentar mais tarde)
async function getCnpj(raw){
  const c=onlyDigits(raw).padStart(14,'0');
  if (!cnpjOk(c)) return {invalid:true};
  if (cnpjCache.has(c)) return cnpjCache.get(c);
  let out=null;
  for (let a=0;a<3&&!out;a++){
    try{ const j=await getJson(`https://brasilapi.com.br/api/cnpj/v1/${c}`); out=j?cnpjFromBrasil(j):{notFound:true}; }
    catch(e){ if(!e.retry&&a>0) break; await sleep(1500*(a+1)); }
  }
  if (!out||out.notFound){ try{ const j=await getJson(`https://publica.cnpj.ws/cnpj/${c}`); if(j) out=cnpjFromWs(j); else out=out||{notFound:true}; }catch(e){ out=out||{error:true}; } }
  if (!out.error) cnpjCache.set(c,out);
  return out;
}
async function getCep(raw){
  const c=onlyDigits(raw).padStart(8,'0');
  if (c.length!==8||/^0+$/.test(c)) return {invalid:true};
  if (cepCache.has(c)) return cepCache.get(c);
  let out=null;
  try{ const j=await getJson(`https://brasilapi.com.br/api/cep/v2/${c}`); if(j) out={cep:c,logradouro:j.street||'',bairro:j.neighborhood||'',cidade:j.city||'',uf:j.state||'',ibge:j.ibge?.city||''}; }catch(e){}
  if (!out){ try{ const j=await getJson(`https://viacep.com.br/ws/${c}/json/`); out=j&&!j.erro?{cep:c,logradouro:j.logradouro||'',bairro:j.bairro||'',cidade:j.localidade||'',uf:j.uf||'',ibge:j.ibge||''}:{notFound:true}; }catch(e){ out={error:true}; } }
  if (!out.error) cepCache.set(c,out);
  return out;
}

/* Página "Consultas": busca única de CNPJ ou CEP, com relatório em PDF e histórico neste navegador */
const CQ_KEY='consultasRecentes';
const cqHistory=()=>{ try{ return JSON.parse(localStorage.getItem(CQ_KEY)||'[]'); }catch(e){ return []; } };
const cqRemember=it=>{ try{ const h=cqHistory().filter(x=>x.q!==it.q); h.unshift({...it,at:Date.now()}); localStorage.setItem(CQ_KEY,JSON.stringify(h.slice(0,12))); }catch(e){} };
function openConsultas(){ leaveProfile().then(ok=>{ if(!ok) return; S.view='consultas'; $('#aside').classList.remove('open'); render(); }); }
function consultasView(){
  const st=S.cq||(S.cq={q:'',res:null,loading:false});
  const inp=el('input',{class:'cq-input',value:st.q,placeholder:'Digite um CNPJ ou CEP',inputmode:'numeric',autocomplete:'off','aria-label':'CNPJ ou CEP'});
  const hint=el('div',{class:'cq-hint'});
  const kind=v=>{ const d=onlyDigits(v); return d.length===14||(d.length>=12&&d.length<=13&&/[./]/.test(v))?'cnpj':d.length===8?'cep':d.length===11?'cpf':''; };
  const syncHint=()=>{ const k=kind(inp.value); hint.textContent=k==='cnpj'?'CNPJ: dados cadastrais da Receita Federal':k==='cep'?'CEP: endereço dos Correios':k==='cpf'?'CPF: só conferimos se o número é válido':'Aceita com ou sem pontuação.'; };
  inp.addEventListener('input',syncHint); syncHint();
  const go=async q=>{
    q=(q??inp.value).trim(); const k=kind(q); if(!q) return;
    st.q=q;
    if (!k){ st.res={kind:'?'}; render(); return; }
    if (k==='cpf'){ st.res={kind:'cpf',ok:cpfOk(q),q:onlyDigits(q)}; render(); return; }
    st.loading=true; st.res=null; render();
    const data=k==='cnpj'?await getCnpj(q):await getCep(q);
    st.loading=false; st.res={kind:k,data,q:onlyDigits(q)};
    if (data&&!data.invalid&&!data.notFound&&!data.error) cqRemember({q:onlyDigits(q),kind:k,label:k==='cnpj'?(data.fantasia||data.razao):`${data.logradouro||data.cidade} · ${data.cidade}/${data.uf}`});
    if (S.view==='consultas') render();
  };
  inp.addEventListener('keydown',e=>{ if(e.key==='Enter') go(); });
  setTimeout(()=>{ if(!st.res&&!st.loading) inp.focus(); },30);
  const v=el('div',{class:'view'},el('div',{class:'cq-page'},
    el('div',{class:'cq-head'},el('h1',{text:'Consultas'}),el('p',{text:'Consulte empresas pelo CNPJ e endereços pelo CEP, com dados públicos e atualizados. Para consultar muitos de uma vez, use “••• Mais ferramentas → Completar dados pelo CNPJ ou CEP” na aba Dados de uma planilha.'})),
    el('div',{class:'cq-search'},inp,el('button',{class:'btn primary',onclick:()=>go(),disabled:st.loading},st.loading?'Consultando…':'Consultar')),hint));
  const page=v.firstChild;
  if (st.loading) page.append(el('div',{class:'cq-card muted'},el('span',{class:'spinner'}),'  Buscando nos dados públicos…'));
  else if (st.res) page.append(cqResult(st.res));
  const hist=cqHistory();
  if (hist.length) page.append(el('div',{class:'cq-recent'},el('div',{class:'rd-title',text:'Consultas recentes neste navegador'}),
    el('div',{class:'cq-chips'},hist.map(h=>el('button',{class:'chip cq-chip',onclick:()=>{ inp.value=h.q; go(h.q); }},el('b',{text:h.kind==='cnpj'?fmtCnpj(h.q):fmtCepTxt(h.q)}),' ',h.label||''))),
    el('button',{class:'btn sm',style:'margin-top:8px',onclick:()=>{ localStorage.removeItem(CQ_KEY); render(); }},'Limpar histórico')));
  return v;
}
function cqResult(r){
  if (r.kind==='?') return el('div',{class:'cq-card'},el('b',{text:'Não reconhecemos o número.'}),el('p',{class:'muted',text:'Digite um CNPJ (14 dígitos) ou um CEP (8 dígitos).'}));
  if (r.kind==='cpf') return el('div',{class:'cq-card'},
    el('div',{class:'cq-status '+(r.ok?'ok':'bad')},r.ok?'✓ CPF válido':'✕ CPF inválido'),
    el('p',{text:r.ok?'Os dígitos verificadores conferem, ou seja, o número foi digitado corretamente. Isso não confirma a quem ele pertence.':'Os dígitos verificadores não conferem: provavelmente há erro de digitação.'}),
    el('p',{class:'muted',text:'Dados de pessoas físicas (nome, endereço, score) não são consultados aqui: eles exigem fornecedores pagos autorizados e uma base legal pela LGPD.'}));
  const d=r.data;
  if (d.invalid) return el('div',{class:'cq-card'},el('div',{class:'cq-status bad'},`✕ ${r.kind==='cnpj'?'CNPJ':'CEP'} inválido`),el('p',{text:r.kind==='cnpj'?'Os dígitos verificadores não conferem. Confira se o número foi digitado corretamente.':'O CEP precisa ter 8 dígitos.'}));
  if (d.notFound) return el('div',{class:'cq-card'},el('div',{class:'cq-status bad'},'Não encontrado'),el('p',{text:`${r.kind==='cnpj'?'Esse CNPJ':'Esse CEP'} não foi encontrado nas bases públicas.`}));
  if (d.error) return el('div',{class:'cq-card'},el('div',{class:'cq-status warn'},'Serviço indisponível'),el('p',{text:'As fontes públicas não responderam agora. Tente de novo em alguns instantes.'}));
  const row=(k,val)=>val||val===0?el('div',{class:'cq-row'},el('span',{text:k}),el('b',{text:String(val)})):null;
  if (r.kind==='cep') return el('div',{class:'cq-card'},
    el('div',{class:'cq-title'},el('h2',{text:d.logradouro||d.cidade}),el('span',{class:'chip',text:fmtCepTxt(d.cep)})),
    el('div',{class:'cq-grid'},row('Logradouro',d.logradouro),row('Bairro',d.bairro),row('Cidade',d.cidade),row('UF',d.uf),row('Código IBGE',d.ibge)),
    el('div',{class:'cq-actions'},el('a',{class:'btn sm',href:`https://www.google.com/maps/search/${encodeURIComponent([d.logradouro,d.bairro,d.cidade,d.uf,fmtCepTxt(d.cep)].filter(Boolean).join(', '))}`,target:'_blank',rel:'noopener'},'Ver no mapa')));
  const ativa=/ativa/i.test(d.situacao);
  return el('div',{class:'cq-card'},
    el('div',{class:'cq-title'},el('div',{},el('h2',{text:d.razao}),d.fantasia?el('div',{class:'muted',text:d.fantasia}):null),
      el('div',{class:'cq-tags'},el('span',{class:'cq-status '+(ativa?'ok':'bad')},d.situacao||'—'),el('span',{class:'chip',text:fmtCnpj(d.cnpj||r.q)}))),
    el('div',{class:'cq-sec',text:'Cadastro'}),
    el('div',{class:'cq-grid'},row('Situação cadastral',[d.situacao,d.dataSituacao?`desde ${fmtDate(d.dataSituacao)}`:''].filter(Boolean).join(' ')),row('Abertura',fmtDate(d.abertura)),
      row('Tempo de empresa',d.abertura?`${Math.floor((Date.now()-pDate(d.abertura))/31557600000)} anos`:''),row('Matriz ou filial',d.tipo),row('Porte',d.porte),row('Natureza jurídica',d.natureza),
      row('Capital social',isNaN(d.capital)?'':'R$ '+nf.format(d.capital)),row('Simples Nacional',d.simples),row('MEI',d.mei)),
    el('div',{class:'cq-sec',text:'Atividade'}),
    el('div',{class:'cq-grid'},row('CNAE principal',[d.cnae,d.cnaeDesc].filter(Boolean).join(' · ')),row('Atividades secundárias',d.secundarios.length?`${d.secundarios.length}`:'Nenhuma')),
    d.secundarios.length?el('details',{class:'cq-more'},el('summary',{text:'Ver atividades secundárias'}),el('ul',{},d.secundarios.map(x=>el('li',{text:`${x.codigo} · ${x.descricao}`})))):null,
    el('div',{class:'cq-sec',text:'Endereço e contato'}),
    el('div',{class:'cq-grid'},row('Endereço',[d.logradouro,d.numero,d.complemento].filter(Boolean).join(', ')),row('Bairro',d.bairro),row('Cidade',d.municipio&&`${d.municipio}/${d.uf}`),row('CEP',d.cep&&fmtCepTxt(d.cep)),row('Telefone',d.telefone),row('E-mail',d.email)),
    d.socios.length?el('div',{class:'cq-sec',text:`Quadro de sócios e administradores (${d.socios.length})`}):null,
    ...(()=>{ if(!d.socios.length) return [];
      const tbl=list=>el('table',{class:'data mini cq-qsa'},el('thead',{},el('tr',{},el('th',{text:'Nome'}),el('th',{text:'Qualificação'}),el('th',{text:'Entrada'}),el('th',{text:'Faixa etária'}))),
        el('tbody',{},list.map(s=>el('tr',{},el('td',{text:s.nome}),el('td',{text:s.qualificacao}),el('td',{text:fmtDate(s.entrada)}),el('td',{class:'muted',text:s.faixa})))));
      return d.socios.length<=10?[tbl(d.socios)]:[tbl(d.socios.slice(0,10)),el('details',{class:'cq-more'},el('summary',{text:`Ver todos os ${d.socios.length}`}),tbl(d.socios.slice(10)))]; })(),
    el('div',{class:'cq-actions'},
      el('button',{class:'btn sm primary',onclick:()=>cnpjPdf(d)},icon('pdf'),'Baixar relatório em PDF'),
      el('button',{class:'btn sm',onclick:async()=>{ const t=[d.razao,d.fantasia,fmtCnpj(d.cnpj),`Situação: ${d.situacao}`,`Abertura: ${fmtDate(d.abertura)}`,`Porte: ${d.porte}`,`CNAE: ${d.cnae} ${d.cnaeDesc}`,`Endereço: ${[d.logradouro,d.numero,d.complemento,d.bairro,d.municipio+'/'+d.uf,fmtCepTxt(d.cep)].filter(Boolean).join(', ')}`,d.telefone&&`Telefone: ${d.telefone}`,d.email&&`E-mail: ${d.email}`].filter(Boolean).join('\n'); try{ await navigator.clipboard.writeText(t); toast('Dados copiados.'); }catch(e){ toast('O navegador bloqueou a cópia.',true); } }},'Copiar dados')),
    el('div',{class:'cq-src muted',text:`Fonte: ${d.fonte}. Dados públicos; podem levar alguns dias para refletir mudanças recentes.`}));
}
function cnpjPdf(d){
  if (!pdfReady()) return;
  const doc=new window.jspdf.jsPDF({unit:'mm',format:'a4'}), PW=210, M=15, CW=PW-2*M, T=pdfTxt;
  const br=brand(), A=br.custom?hexRgb(br.color):PDFC.accent, onA=br.custom&&lum(br.color)>0.55?[17,17,17]:[255,255,255];
  doc.setFillColor(...A); doc.rect(0,0,PW,34,'F');
  doc.setTextColor(...onA); doc.setFont('helvetica','bold'); doc.setFontSize(8.5); doc.text(T(`${br.name?br.name.toUpperCase()+'  ·  ':''}CONSULTA DE CNPJ`),M,11,{charSpace:0.6});
  doc.setFontSize(17); doc.text(doc.splitTextToSize(T(d.razao),CW)[0],M,21);
  doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.text(T(`${fmtCnpj(d.cnpj)} · consultado em ${fmtWhen(Date.now())}`),M,28);
  let y=44;
  const sec=t=>{ if(y>265){ doc.addPage(); y=20; } doc.setTextColor(...PDFC.text); doc.setFont('helvetica','bold'); doc.setFontSize(11.5); doc.text(T(t),M,y); doc.setDrawColor(...A); doc.setLineWidth(0.6); doc.line(M,y+2,M+12,y+2); y+=8; };
  const kv=(k,v)=>{ if(!v&&v!==0) return; const lines=doc.splitTextToSize(T(String(v)),CW-52); if(y+lines.length*4.6>280){ doc.addPage(); y=20; }
    doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(...PDFC.t3); doc.text(T(k),M,y); doc.setTextColor(...PDFC.text); doc.text(lines,M+52,y); y+=lines.length*4.6+1.6; };
  sec('Cadastro'); kv('Nome fantasia',d.fantasia); kv('Situação cadastral',[d.situacao,d.dataSituacao?`desde ${fmtDate(d.dataSituacao)}`:''].filter(Boolean).join(' ')); kv('Abertura',fmtDate(d.abertura)); kv('Matriz ou filial',d.tipo); kv('Porte',d.porte); kv('Natureza jurídica',d.natureza); kv('Capital social',isNaN(d.capital)?'':'R$ '+nf.format(d.capital)); kv('Simples Nacional',d.simples); kv('MEI',d.mei);
  y+=3; sec('Atividade'); kv('CNAE principal',[d.cnae,d.cnaeDesc].filter(Boolean).join(' - ')); d.secundarios.slice(0,25).forEach((x,i)=>kv(i?'':'Secundárias',`${x.codigo} - ${x.descricao}`));
  y+=3; sec('Endereço e contato'); kv('Endereço',[d.logradouro,d.numero,d.complemento].filter(Boolean).join(', ')); kv('Bairro',d.bairro); kv('Cidade',d.municipio&&`${d.municipio}/${d.uf}`); kv('CEP',d.cep&&fmtCepTxt(d.cep)); kv('Telefone',d.telefone); kv('E-mail',d.email);
  if (d.socios.length){ y+=3; sec(`Quadro de sócios e administradores (${d.socios.length})`); d.socios.forEach(s=>kv(s.qualificacao||'Sócio',`${s.nome}${s.entrada?` (desde ${fmtDate(s.entrada)})`:''}`)); }
  const n=doc.getNumberOfPages(); for(let i=1;i<=n;i++){ doc.setPage(i); doc.setFontSize(7.5); doc.setTextColor(...PDFC.t3); doc.text(T(`Fonte: ${d.fonte} · dados públicos`),M,290); doc.text(`Página ${i} de ${n}`,PW-M,290,{align:'right'}); }
  savePdf(doc,`CNPJ ${onlyDigits(d.cnpj)} - ${String(d.razao).replace(/[\\/:*?"<>|]/g,'_').slice(0,60)}.pdf`);
}

/* "Enriquecer dados": completa a base com os dados públicos de cada CNPJ ou CEP da coluna escolhida */
const ENRICH_CNPJ=[['razao','Razão social','text'],['fantasia','Nome fantasia','text'],['situacao','Situação cadastral','text'],['abertura','Data de abertura','date'],['porte','Porte','text'],
  ['cnaeDesc','Atividade principal','text'],['natureza','Natureza jurídica','text'],['municipio','Município','text'],['uf','UF','text'],['capital','Capital social','number'],['simples','Optante pelo Simples','text'],['telefone','Telefone (Receita)','text'],['email','E-mail (Receita)','text']];
const ENRICH_CEP=[['logradouro','Logradouro','text'],['bairro','Bairro','text'],['cidade','Cidade','text'],['uf','UF','text']];
const ENRICH_DEF=new Set(['razao','fantasia','situacao','abertura','porte','cnaeDesc','municipio','uf','capital','simples','logradouro','bairro','cidade']);
function guessIdCol(meta,kind){
  const rx=kind==='cnpj'?/cnpj/i:/\bcep\b/i, len=kind==='cnpj'?14:8, ok=kind==='cnpj'?cnpjOk:(v=>onlyDigits(v).length===8);
  const named=meta.columns.findIndex(c=>!c.virtual&&rx.test(c.name)); if(named>=0) return named;
  let best=-1, score=0;
  meta.columns.forEach((c,j)=>{ if(c.virtual||c.type==='date') return; let n=0,hit=0; for(const r of S.rows){ const v=r[j]; if(v==null||v==='') continue; n++; const d=onlyDigits(v).padStart(len,'0'); if(d.length===len&&ok(d)) hit++; if(n>=200) break; } if(n&&hit/n>0.7&&hit>score){ score=hit; best=j; } });
  return best;
}
function enrichDialog(meta){
  const cj=guessIdCol(meta,'cnpj'), pj=guessIdCol(meta,'cep');
  let kind=cj>=0?'cnpj':pj>=0?'cep':'cnpj';
  const kindSel=el('select',{},el('option',{value:'cnpj',text:'CNPJ (dados da empresa na Receita Federal)'}),el('option',{value:'cep',text:'CEP (endereço)'})); kindSel.value=kind;
  const colSel=el('select',{},meta.columns.map((c,j)=>c.virtual?null:el('option',{value:String(j),text:c.name})));
  const fieldsBox=el('div',{class:'ck-list'}), info=el('div',{class:'muted',style:'font-size:12.5px'}), prog=el('div',{class:'enr-prog'}), err=el('div',{class:'form-err'});
  let cks=[];
  const draw=()=>{
    kind=kindSel.value; const g=kind==='cnpj'?cj:pj; if(g>=0) colSel.value=String(g);
    fieldsBox.innerHTML=''; cks=(kind==='cnpj'?ENRICH_CNPJ:ENRICH_CEP).map(([k,lb])=>{ const ck=el('input',{type:'checkbox'}); ck.checked=ENRICH_DEF.has(k); ck._k=k; fieldsBox.append(el('label',{class:'ck-row'},ck,el('span',{},el('b',{text:lb})))); return ck; });
    countInfo();
  };
  const countInfo=()=>{ const j=+colSel.value, len=kind==='cnpj'?14:8, set=new Set(); let bad=0;
    for(const r of S.rows){ const v=r[j]; if(v==null||v==='') continue; const d=onlyDigits(v).padStart(len,'0'); if(d.length!==len||(kind==='cnpj'&&!cnpjOk(d))){ bad++; continue; } set.add(d); }
    info.textContent=`${nf.format(set.size)} ${kind==='cnpj'?'CNPJs':'CEPs'} diferentes para consultar${bad?` · ${nf.format(bad)} ${bad===1?'valor inválido será ignorado':'valores inválidos serão ignorados'}`:''}. Tempo estimado: ${set.size<=60?'menos de 1 minuto':`cerca de ${Math.ceil(set.size*(kind==='cnpj'?0.7:0.25)/60)} min`}.`;
    return set; };
  kindSel.onchange=draw; colSel.onchange=countInfo; draw();
  let cancel=false;
  const content=el('div',{class:'enr-form'},
    el('div',{class:'form-row'},fld('Tipo de consulta',kindSel),fld('Coluna com o número',colSel)),info,
    el('div',{class:'rd-title',style:'margin-top:12px',text:'Colunas a adicionar'}),fieldsBox,prog,err);
  const dlg=formModal('Completar dados pelo CNPJ ou CEP','Completa cada linha com dados públicos: para CNPJ, razão social, situação, porte, atividade e cidade da empresa; para CEP, o endereço. As novas colunas entram no fim da tabela.',content,'Consultar e adicionar colunas',async()=>{
    const j=+colSel.value, keys=cks.filter(c=>c.checked).map(c=>c._k), set=countInfo(), len=kind==='cnpj'?14:8;
    if (!keys.length){ err.textContent='Escolha pelo menos uma coluna para adicionar.'; return false; }
    if (!set.size){ err.textContent=`A coluna escolhida não tem ${kind==='cnpj'?'CNPJs':'CEPs'} válidos.`; return false; }
    err.textContent=''; cancel=false; [kindSel,colSel,...cks].forEach(x=>x.disabled=true);
    const bar=el('i'), txt=el('span'), stop=el('button',{class:'btn sm',onclick:()=>{ cancel=true; stop.disabled=true; stop.textContent='Parando…'; }},'Parar');
    prog.innerHTML=''; prog.append(el('div',{class:'enr-bar'},bar),el('div',{class:'enr-row'},txt,stop));
    const list=[...set], res=new Map(); let done=0, fail=0;
    const worker=async()=>{ while(list.length&&!cancel){ const d=list.shift(); const r=kind==='cnpj'?await getCnpj(d):await getCep(d); res.set(d,r); done++; if(r.error) fail++;
      bar.style.width=`${Math.round(done/set.size*100)}%`; txt.textContent=`${nf.format(done)} de ${nf.format(set.size)} consultados${fail?` · ${fail} sem resposta`:''}`; if(kind==='cnpj') await sleep(350); } };
    await Promise.all(Array.from({length:kind==='cnpj'?2:4},worker));
    if (aborted) return; // "Cancelar" fecha sem salvar; "Parar" salva o que já foi consultado
    if (!res.size){ [kindSel,colSel,...cks].forEach(x=>x.disabled=false); prog.innerHTML=''; return false; }
    // monta as novas colunas
    const defs=(kind==='cnpj'?ENRICH_CNPJ:ENRICH_CEP).filter(([k])=>keys.includes(k));
    const m=structuredClone(meta); m.columns=m.columns.filter(c=>!c.virtual);
    const names=new Set(m.columns.map(c=>fold(c.name))), newCols=defs.map(([k,lb,ty])=>{ let n=lb; while(names.has(fold(n))) n+=kind==='cnpj'?' (Receita)':' (CEP)'; names.add(fold(n)); return {k,name:n,type:ty}; });
    if (kind==='cnpj'&&keys.includes('situacao')) newCols.push({k:'_status',name:(()=>{ let n='Consulta CNPJ'; while(names.has(fold(n))) n+=' (2)'; return n; })(),type:'text'});
    let found=0, nf0=0, inv=0;
    const rows=S.rows.map(r=>{ const v=r[j], d=v==null||v===''?null:onlyDigits(v).padStart(len,'0'), x=d?res.get(d):null;
      if (x&&!x.error&&!x.notFound&&!x.invalid) found++; else if(x&&x.notFound) nf0++; else if(d&&(!x||x.invalid)) inv++;
      return [...r,...newCols.map(c=>{ if(c.k==='_status') return !d?null:!x?(cancel?'Não consultado':'Inválido'):x.invalid?'CNPJ inválido':x.notFound?'Não encontrado':x.error?'Sem resposta':'Encontrado';
        if(!x||x.error||x.notFound||x.invalid) return null; const val=x[c.k]; return val===''||val==null||(typeof val==='number'&&isNaN(val))?null:val; })]; });
    m.columns.push(...newCols.map(c=>({name:c.name,type:c.type})));
    // gráficos que passam a fazer sentido
    const addC=s=>{ s.skipEmpty=true; if(!(m.charts||[]).some(c=>chartKey(c)===chartKey(s))){ const r2=aggregate(m,s,rows); if(r2&&r2.labels.length>=2) (m.charts=m.charts||[]).push({id:uid8(),...s}); } };
    const nm=k=>newCols.find(c=>c.k===k)?.name;
    if (kind==='cnpj'){ if(nm('situacao')) addC({type:'pie',x:nm('situacao'),y:'',agg:'count',title:'Empresas por situação cadastral',why:'Quantas empresas da base estão ativas, baixadas, inaptas ou suspensas na Receita Federal.'});
      if(nm('uf')) addC({type:'map',x:nm('uf'),y:'',agg:'count',title:'Empresas por estado',why:'Em quais estados estão as empresas da base.'});
      if(nm('porte')) addC({type:'pie',x:nm('porte'),y:'',agg:'count',title:'Empresas por porte',why:'Distribuição das empresas por porte (micro, pequena, demais).'});
      if(nm('cnaeDesc')) addC({type:'hbar',x:nm('cnaeDesc'),y:'',agg:'count',title:'Principais atividades (CNAE)',why:'As atividades econômicas mais comuns entre as empresas da base.'}); }
    else { if(nm('cidade')) addC({type:'hbar',x:nm('cidade'),y:'',agg:'count',title:'Registros por cidade',why:'Em quais cidades estão os endereços da base.'}); if(nm('uf')) addC({type:'map',x:nm('uf'),y:'',agg:'count',title:'Registros por estado',why:'A fatia de cada estado na base.'}); }
    const t=toast('Salvando…',false,60000);
    try{ await saveBase(m,rows); S.rows=rows; S.dirty=false; t.remove(); render();
      toast(`${cancel?'Consulta interrompida. ':''}${nf.format(found)} ${found===1?'linha completada':'linhas completadas'}${nf0?` · ${nf0} não encontrada(s)`:''}${inv?` · ${inv} com número inválido`:''}${fail?` · ${fail} sem resposta (tente de novo depois)`:''}.`,false,8000); }
    catch(e){ t.remove(); handleWriteError(e); return false; }
  },'wide enr-modal');
  let aborted=false;
  const abort=()=>{ aborted=true; cancel=true; };
  dlg.m.querySelector('.actions .btn').addEventListener('click',abort);
  dlg.m.parentElement.addEventListener('click',e=>{ if(e.target===dlg.m.parentElement) abort(); });
  document.addEventListener('keydown',function esc(e){ if(e.key==='Escape'){ abort(); document.removeEventListener('keydown',esc); } });
}

export { CQ_KEY, ENRICH_CEP, ENRICH_CNPJ, ENRICH_DEF, cepCache, cnpjCache, cnpjFromBrasil, cnpjFromWs, cnpjOk, cnpjPdf, consultasView, cpfOk, cqHistory, cqRemember, cqResult, enrichDialog, fmtCepTxt, fmtCnpj, fmtPhoneBr, getCep, getCnpj, getJson, guessIdCol, onlyDigits, openConsultas, sleep, titleCase };
