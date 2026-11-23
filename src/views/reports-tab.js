import { confirmBox, modal } from '../app/modals.js';
import { icon } from '../app/render.js';
import { distinctCount } from '../charts/auto-charts.js';
import { buildReportPdf, chartLabels, persistCharts, savePdf } from '../charts/draw-and-pdf.js';
import { S, charts } from '../core/state.js';
import { el, fmtDate, nf, toast, uid8 } from '../core/utils.ts';
import { markStep } from '../easy/checklist.js';
import { autoTour, helpBar } from '../easy/help.js';
import { reportPrev } from '../features/compare.js';
import { computeKpis } from './new-chart.js';

/* ----- Aba Relatórios -----
   Cada base guarda seus relatórios em meta.reports. O envio manual (PDF, WhatsApp e e-mail) funciona aqui no
   navegador; o envio automático no horário depende de uma função no servidor (Firebase, plano Blaze), que vai
   ler estes mesmos campos: schedule {freq, weekday, monthday, time, tz} e emails. */
const PERIODS=[['all','Todos os registros'],['7d','Últimos 7 dias'],['30d','Últimos 30 dias'],['month','Mês atual'],['prevmonth','Mês anterior'],['year','Ano atual']];
const WEEKDAYS=['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];
const isoDay=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
function periodRange(p,now=new Date()){
  const y=now.getFullYear(), m=now.getMonth(), back=n=>{ const a=new Date(now); a.setDate(a.getDate()-n); return a; };
  if (p==='7d') return {from:isoDay(back(6)),to:isoDay(now)};
  if (p==='30d') return {from:isoDay(back(29)),to:isoDay(now)};
  if (p==='month') return {from:isoDay(new Date(y,m,1)),to:isoDay(new Date(y,m+1,0))};
  if (p==='prevmonth') return {from:isoDay(new Date(y,m-1,1)),to:isoDay(new Date(y,m,0))};
  if (p==='year') return {from:`${y}-01-01`,to:`${y}-12-31`};
  return null;
}
function reportRows(meta,rep){
  let rows=S.rows; const f=rep.filter;
  if (f&&f.col){ const j=meta.columns.findIndex(c=>c.name===f.col); if(j>=0) rows=rows.filter(r=>String(r[j]??'(vazio)')===f.val); }
  const rg=periodRange(rep.period), dj=meta.columns.findIndex(c=>c.type==='date');
  if (rg&&dj>=0) rows=rows.filter(r=>{ const v=r[dj]; if(!v||!/^\d{4}-\d{2}-\d{2}/.test(v)) return false; const d=String(v).slice(0,10); return d>=rg.from&&d<=rg.to; });
  return rows;
}
function periodText(meta,rep){
  const rg=periodRange(rep.period), dc=meta.columns.find(c=>c.type==='date'), p=[];
  p.push(rg&&dc?`${PERIODS.find(x=>x[0]===rep.period)[1]} (${fmtDate(rg.from)} a ${fmtDate(rg.to)})`:'Todos os registros');
  if (rep.filter&&rep.filter.col) p.push(`só ${rep.filter.col}: ${rep.filter.val}`);
  return p.join(' · ');
}
function scheduleText(rep){
  const s=rep.schedule||{}, h=s.time||'08:00';
  if (!s.freq||s.freq==='none') return 'Sem agendamento';
  if (s.freq==='daily') return `Todo dia às ${h}`;
  if (s.freq==='weekly'){ const i=s.weekday??1; return `${i===0||i===6?'Todo':'Toda'} ${WEEKDAYS[i]} às ${h}`; }
  return `${(s.monthday||1)>28?'No último dia':'Todo dia '+(s.monthday||1)} do mês às ${h}`;
}
function nextRun(rep,now=new Date()){
  const s=rep.schedule||{}; if(!s.freq||s.freq==='none') return null;
  const [hh,mm]=(s.time||'08:00').split(':').map(Number);
  for (let i=0;i<=62;i++){
    const d=new Date(now.getFullYear(),now.getMonth(),now.getDate()+i,hh,mm);
    if (d<=now) continue;
    if (s.freq==='daily') return d;
    if (s.freq==='weekly'&&d.getDay()===(s.weekday??1)) return d;
    if (s.freq==='monthly'){ const last=new Date(d.getFullYear(),d.getMonth()+1,0).getDate(); if(d.getDate()===Math.min(s.monthday||1,last)) return d; }
  }
  return null;
}
const fmtNext=d=>d.toLocaleString('pt-BR',{weekday:'short',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
const phoneDigits=s=>{ let d=String(s||'').replace(/\D/g,''); if(d.length===10||d.length===11) d='55'+d; return d; };
const phoneOk=d=>/^\d{12,15}$/.test(d);
const fmtPhone=d=>{ const m=/^55(\d{2})(\d{4,5})(\d{4})$/.exec(d); return m?`(${m[1]}) ${m[2]}-${m[3]}`:'+'+d; };
const emailOk=s=>/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(s);
const isTouch=()=>!!window.matchMedia&&matchMedia('(pointer:coarse)').matches;
const reportSpecs=(meta,rep)=>(meta.charts||[]).filter(c=>!rep.charts||rep.charts.includes(c.id));
function reportText(meta,rep,rows){
  const kp=rep.kpis===false?[]:computeKpis(meta,rows,reportPrev(meta,rep)), L=[];
  if (rep.message) L.push(rep.message,'');
  L.push(`*${rep.name}*`,`Base: ${meta.name}`,`Período: ${periodText(meta,rep)}`);
  if (!kp.length) L.push(`Registros: ${nf.format(rows.length)}`);
  if (kp.length){ L.push(''); kp.forEach(k=>L.push(`• ${k.lb}: ${k.vl}${k.cmp?` (${k.cmp})`:''}`)); }
  if (reportSpecs(meta,rep).length||kp.length) L.push('','O relatório completo, com os gráficos explicados, está no PDF em anexo.');
  return L.join('\n');
}
function pdfReady(){ if(window.jspdf?.jsPDF&&window.Chart) return true; toast('Não foi possível carregar o gerador de PDF. Verifique sua conexão e recarregue a página.',true); return false; }
function reportPdf(meta,rep){
  const rows=reportRows(meta,rep);
  const out=buildReportPdf(meta,{specs:reportSpecs(meta,rep),rows,prev:reportPrev(meta,rep),kpis:rep.kpis!==false,title:rep.name,kicker:`RELATÓRIO · ${meta.name.toUpperCase()}`,filterText:`Período: ${periodText(meta,rep)}`});
  return {...out,rows};
}
function safePdf(meta,rep){ if(!pdfReady()) return null; try{ return reportPdf(meta,rep); }catch(e){ console.error(e); toast('Não foi possível gerar o PDF.',true); return null; } }
async function reportDownload(meta,rep){ markStep('rep'); const out=safePdf(meta,rep); if(out) await savePdf(out.doc,out.filename); }
function reportWhats(meta,rep,phone){
  const out=safePdf(meta,rep); if(!out) return;
  const text=reportText(meta,rep,out.rows);
  // no celular: compartilha o PDF já anexado, com a mensagem (a pessoa escolhe o WhatsApp e o contato)
  if (isTouch()&&window.File&&navigator.canShare){
    const file=new File([out.doc.output('blob')],out.filename,{type:'application/pdf'});
    if (navigator.canShare({files:[file]})){ navigator.share({files:[file],text}).catch(e=>{ if(e.name!=='AbortError') toast('Não foi possível compartilhar.',true); }); return; }
  }
  window.open(`https://wa.me/${phone||''}?text=${encodeURIComponent(text)}`,'_blank','noopener');
  savePdf(out.doc,out.filename);
  toast('A conversa abriu no WhatsApp com a mensagem pronta. O PDF foi baixado: anexe-o na conversa.',false,8000);
}
function reportEmail(meta,rep,how){
  const out=safePdf(meta,rep); if(!out) return;
  const to=(rep.emails||[]).join(','), su=`${rep.name} · ${meta.name}`, body=reportText(meta,rep,out.rows).replace(/\*/g,'');
  if (how==='gmail') window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(su)}&body=${encodeURIComponent(body)}`,'_blank','noopener');
  else { const a=el('a',{href:`mailto:${to}?subject=${encodeURIComponent(su)}&body=${encodeURIComponent(body)}`}); document.body.append(a); a.click(); a.remove(); }
  savePdf(out.doc,out.filename);
  toast('O e-mail abriu com assunto e texto prontos. O PDF foi baixado: anexe-o antes de enviar.',false,8000);
}
// botão direto: 1 número (ou nenhum) envia na hora; vários números abre a escolha do contato
function whatsPick(meta,rep){ markStep('rep');
  const phones=rep.phones||[];
  if (phones.length<=1||isTouch()){ reportWhats(meta,rep,phones[0]||''); return; }
  let close; const go=p=>()=>{ close(); reportWhats(meta,rep,p); };
  close=modal('Enviar no WhatsApp',`Para quem enviar “${rep.name}”?`,
    el('div',{class:'send-btns',style:'margin-top:4px'},phones.map(p=>el('button',{class:'btn',onclick:go(p)},icon('chat'),fmtPhone(p))),el('button',{class:'btn',onclick:go('')},icon('chat'),'Outro contato')),
    [{label:'Cancelar'}]);
}
function sendDialog(meta,rep){ markStep('rep');
  const rows=reportRows(meta,rep), phones=rep.phones||[], emails=rep.emails||[];
  let close; const go=fn=>()=>{ close(); fn(); };
  const content=el('div',{class:'send-box'},
    el('div',{class:'send-sec'},el('div',{class:'rd-title',text:'WhatsApp'}),
      el('div',{class:'send-btns'},
        phones.map(p=>el('button',{class:'btn',onclick:go(()=>reportWhats(meta,rep,p))},icon('chat'),fmtPhone(p))),
        el('button',{class:'btn',onclick:go(()=>reportWhats(meta,rep,''))},icon('chat'),phones.length?'Outro contato':'Escolher contato')),
      el('p',{class:'send-note',text:isTouch()?'Abre o compartilhamento do celular com o PDF anexado e a mensagem: escolha o WhatsApp e o contato.':'Abre a conversa no WhatsApp com a mensagem pronta e baixa o PDF para você anexar.'})),
    el('div',{class:'send-sec'},el('div',{class:'rd-title',text:emails.length?`E-mail · para ${emails.join(', ')}`:'E-mail'}),
      el('div',{class:'send-btns'},
        el('button',{class:'btn',onclick:go(()=>reportEmail(meta,rep,'gmail'))},icon('mail'),'Abrir no Gmail'),
        el('button',{class:'btn',onclick:go(()=>reportEmail(meta,rep,'app'))},icon('mail'),'Abrir no app de e-mail')),
      el('p',{class:'send-note',text:'Abre o e-mail com assunto e texto prontos e baixa o PDF para você anexar.'})),
    el('div',{class:'send-sec'},el('div',{class:'rd-title',text:'Mensagem que vai junto'}),el('pre',{class:'send-prev',text:reportText(meta,rep,rows)})));
  close=modal('Enviar agora',`“${rep.name}”: ${nf.format(rows.length)} registros no período escolhido.`,content,[{label:'Fechar'}]);
}
function reportDialog(meta,existing){
  const charts=meta.charts||[];
  const r=existing?structuredClone(existing):{id:uid8(),name:`Resumo de ${meta.name}`,charts:charts.map(c=>c.id),kpis:true,period:'all',filter:null,emails:[],phones:[],message:'',consent:false,createdAt:Date.now()};
  r.schedule={freq:'none',weekday:1,monthday:1,time:'08:00',...(r.schedule||{})};
  const bg=el('div',{class:'modal-bg'});
  const onKey=e=>{ if(e.key==='Escape') close(); };
  const close=()=>{ bg.remove(); document.removeEventListener('keydown',onKey); };
  bg.addEventListener('click',e=>{ if(e.target===bg) close(); });
  document.addEventListener('keydown',onKey);
  const sec=(title,...kids)=>el('div',{class:'rd-side'},el('div',{class:'rd-title',text:title}),...kids);
  // conteúdo
  const name=el('input',{value:r.name,maxlength:80});
  const kCk=el('input',{type:'checkbox'}); kCk.checked=r.kpis!==false;
  const cks=charts.map(c=>{ const L=chartLabels(c,null); const ck=el('input',{type:'checkbox'}); ck.checked=!r.charts||r.charts.includes(c.id);
    return {c,ck,row:el('label',{class:'ck-row'},ck,el('span',{},el('b',{text:L.title}),el('small',{text:L.sub})))}; });
  // período e filtro
  const dcol=meta.columns.find(c=>c.type==='date');
  const per=el('select',{disabled:!dcol},PERIODS.map(([v,t])=>el('option',{value:v,text:t}))); per.value=dcol?r.period:'all';
  const cats=meta.columns.map((c,j)=>({c,j})).filter(({c,j})=>c.type==='text'&&distinctCount(S.rows,j,200)<=200);
  const fCol=el('select',{},el('option',{value:'',text:'Nenhum'}),cats.map(({c})=>el('option',{value:c.name,text:c.name})));
  const fVal=el('select',{});
  const fillVals=()=>{ fVal.innerHTML=''; fVal.disabled=!fCol.value; if(!fCol.value) return; const j=meta.columns.findIndex(c=>c.name===fCol.value);
    [...new Set(S.rows.map(x=>String(x[j]??'(vazio)')))].sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true})).forEach(v=>fVal.append(el('option',{value:v,text:v}))); };
  fCol.value=r.filter?.col||''; fillVals(); if(r.filter) fVal.value=r.filter.val; fCol.onchange=fillVals;
  // agendamento
  const freq=el('select',{},[['none','Não agendar'],['daily','Todo dia'],['weekly','Toda semana'],['monthly','Todo mês']].map(([v,t])=>el('option',{value:v,text:t})));
  const wd=el('select',{},WEEKDAYS.map((t,i)=>el('option',{value:String(i),text:t})));
  const md=el('select',{},[...Array(28)].map((_,i)=>el('option',{value:String(i+1),text:`Dia ${i+1}`})),el('option',{value:'31',text:'Último dia do mês'}));
  const tm=el('input',{type:'time',value:r.schedule.time,step:900});
  freq.value=r.schedule.freq; wd.value=String(r.schedule.weekday); md.value=String(r.schedule.monthday);
  const wdF=el('label',{class:'field'},'Dia da semana',wd), mdF=el('label',{class:'field'},'Dia do mês',md), tmF=el('label',{class:'field'},'Horário',tm);
  const syncFreq=()=>{ wdF.hidden=freq.value!=='weekly'; mdF.hidden=freq.value!=='monthly'; tmF.hidden=freq.value==='none'; }; freq.onchange=syncFreq; syncFreq();
  // destinatários
  const em=el('textarea',{rows:2,placeholder:'ex.: financeiro@empresa.com.br, gestor@empresa.com.br'}); em.value=(r.emails||[]).join(', ');
  const ph=el('textarea',{rows:2,placeholder:'ex.: (61) 99999-9999, (11) 98888-7777'}); ph.value=(r.phones||[]).map(fmtPhone).join(', ');
  const msg=el('textarea',{rows:3,maxlength:600,placeholder:'Opcional. Ex.: Bom dia! Segue o resumo da semana.'}); msg.value=r.message||'';
  const cons=el('input',{type:'checkbox'}); cons.checked=!!r.consent;
  const err=el('div',{});
  function save(){
    const emails=[...new Set(em.value.split(/[\s,;]+/).map(s=>s.trim().toLowerCase()).filter(Boolean))];
    const phonesRaw=ph.value.split(/[,;\n]+/).map(s=>s.trim()).filter(Boolean), phones=phonesRaw.map(phoneDigits);
    const sel=cks.filter(x=>x.ck.checked).map(x=>x.c.id), errs=[];
    if (!name.value.trim()) errs.push('Dê um nome ao relatório.');
    if (!sel.length&&!kCk.checked) errs.push('Escolha pelo menos um gráfico ou os indicadores.');
    const badE=emails.filter(e=>!emailOk(e)); if(badE.length) errs.push(`E-mail inválido: ${badE.join(', ')}.`);
    const badP=phonesRaw.filter((p,i)=>!phoneOk(phones[i])); if(badP.length) errs.push(`Número inválido: ${badP.join(', ')}. Use DDD + número, ex.: (61) 99999-9999.`);
    if (freq.value!=='none'&&!emails.length) errs.push('Para agendar, informe pelo menos um e-mail: o envio automático é feito por e-mail.');
    if ((emails.length||phones.length)&&!cons.checked) errs.push('Confirme que os destinatários autorizaram receber estes relatórios.');
    err.innerHTML=''; errs.forEach(t=>err.append(el('div',{class:'an-err',text:t})));
    if (errs.length){ err.scrollIntoView({block:'nearest',behavior:'smooth'}); return; }
    const rep={...r,name:name.value.trim(),kpis:kCk.checked,charts:sel,period:dcol?per.value:'all',filter:fCol.value?{col:fCol.value,val:fVal.value}:null,
      schedule:{freq:freq.value,weekday:+wd.value,monthday:+md.value,time:tm.value||'08:00',tz:Intl.DateTimeFormat().resolvedOptions().timeZone||'America/Sao_Paulo'},
      emails,phones:[...new Set(phones)],message:msg.value.trim(),consent:cons.checked,updatedAt:Date.now()};
    const m=structuredClone(meta), list=m.reports||[];
    m.reports=list.some(x=>x.id===rep.id)?list.map(x=>x.id===rep.id?rep:x):list.concat(rep);
    close(); persistCharts(m); toast(existing?'Relatório atualizado.':'Relatório criado.');
  }
  const box=el('div',{class:'modal xwide rep-form',role:'dialog','aria-modal':'true'},
    el('h3',{text:existing?'Editar relatório':'Novo relatório'}),
    el('p',{text:'Escolha o que entra no relatório, o período dos dados e para quem enviar.'}),
    el('label',{class:'field'},'Nome do relatório',name),
    sec('O que entra no relatório',
      el('label',{class:'ck-row'},kCk,el('span',{},el('b',{text:'Indicadores'}),el('small',{text:'Totais, médias e contagens do topo da aba Gráficos'}))),
      charts.length?el('div',{class:'ck-list'},cks.map(x=>x.row)):el('p',{class:'send-note',text:'Esta base ainda não tem gráficos. Crie na aba Gráficos para incluí-los aqui.'}),
      charts.length>1?el('button',{class:'btn sm',type:'button',style:'margin-top:8px',onclick:()=>{ const on=!cks.every(x=>x.ck.checked); cks.forEach(x=>x.ck.checked=on); }},'Marcar ou desmarcar todos'):null),
    sec('Dados considerados',
      el('div',{class:'rd-opts',style:'margin-top:0'},
        el('label',{class:'field'},dcol?`Período (${dcol.name})`:'Período (a base não tem coluna de data)',per),
        el('div',{class:'rd-row'},el('label',{class:'field'},'Filtrar por',fCol),el('label',{class:'field'},'Valor',fVal))),
      el('p',{class:'send-note',text:'O período é calculado no dia do envio: “Últimos 7 dias” sempre pega a semana mais recente.'})),
    sec('Agendamento',
      el('div',{class:'rep-sched'},el('label',{class:'field'},'Frequência',freq),wdF,mdF,tmF),
      el('p',{class:'send-note',text:'O envio automático é feito por e-mail e ainda está em ativação. O agendamento fica salvo e passa a valer quando o envio no servidor for ligado.'})),
    sec('Destinatários',
      el('div',{class:'rd-opts',style:'margin-top:0'},el('label',{class:'field'},'E-mails',em),el('label',{class:'field'},'WhatsApp (envio manual)',ph)),
      el('label',{class:'field',style:'margin-top:10px'},'Mensagem no início (opcional)',msg),
      el('label',{class:'rd-check'},cons,'Os donos destes e-mails e números autorizaram receber estes relatórios.')),
    err,
    el('div',{class:'actions'},el('button',{class:'btn',onclick:close},'Cancelar'),el('button',{class:'btn primary',onclick:save},existing?'Salvar':'Criar relatório')));
  bg.append(box); document.body.append(bg); name.focus();
}
function renderReports(view,meta){
  const reps=meta.reports||[];
  view.append(helpBar('relatorios')); autoTour('relatorios');
  const newBtn=()=>S.readOnly?null:el('button',{class:'btn primary',onclick:()=>reportDialog(meta)},icon('plus'),'Novo relatório');
  view.append(el('div',{class:'rep-top'},
    el('div',{},el('h2',{class:'rep-h',text:'Relatórios'}),el('p',{class:'rep-lead',text:'Monte relatórios com os gráficos e indicadores desta base, escolha o período e para quem enviar.'})),
    reps.length?newBtn():null));
  view.append(el('div',{class:'rep-note'},icon('clock'),el('span',{},el('b',{text:'Envio automático em ativação. '}),'Os agendamentos já ficam salvos e passam a valer quando o envio por e-mail no servidor for ligado. Por enquanto, use “Enviar agora”: o WhatsApp ou o e-mail abrem com a mensagem pronta e o PDF para anexar.')));
  if (!reps.length){
    view.append(el('div',{class:'rep-empty'},el('b',{text:'Nenhum relatório nesta base ainda.'}),
      el('p',{text:(meta.charts||[]).length?'Crie o primeiro: escolha os gráficos, o período e os destinatários.':'Esta base ainda não tem gráficos. Você pode criá-los na aba Gráficos ou montar um relatório só com os indicadores.'}),newBtn()));
    return;
  }
  const grid=el('div',{class:'rep-grid'});
  for (const rep of reps){
    const n=reportSpecs(meta,rep).length, nx=nextRun(rep);
    const rcp=[...(rep.emails||[]),...(rep.phones||[]).map(fmtPhone)];
    const what=[rep.kpis!==false?'Indicadores':null,n?`${n} gráfico${n===1?'':'s'}`:null].filter(Boolean).join(' + ')||'Nada selecionado';
    grid.append(el('article',{class:'rep-card'},
      el('div',{class:'rep-name',text:rep.name}),
      el('dl',{class:'rep-dl'},
        el('dt',{text:'Conteúdo'}),el('dd',{text:what}),
        el('dt',{text:'Dados'}),el('dd',{text:periodText(meta,rep)}),
        el('dt',{text:'Agendamento'}),el('dd',{},scheduleText(rep),nx?el('span',{class:'rep-next',text:` · próximo: ${fmtNext(nx)} (aguardando ativação)`}):null),
        el('dt',{text:'Destinatários'}),el('dd',{text:rcp.length?rcp.join(', '):'Nenhum cadastrado'})),
      el('div',{class:'rep-actions'},
        el('button',{class:'btn sm whats',title:(rep.phones||[]).length===1?`Enviar para ${fmtPhone(rep.phones[0])}`:'Enviar pelo WhatsApp',onclick:()=>whatsPick(meta,rep)},icon('chat'),'Enviar no WhatsApp'),
        el('button',{class:'btn sm primary',onclick:()=>sendDialog(meta,rep)},icon('send'),'Enviar agora'),
        el('button',{class:'btn sm',onclick:()=>reportDownload(meta,rep)},icon('pdf'),'Baixar PDF'),
        S.readOnly?null:el('button',{class:'btn sm',onclick:()=>reportDialog(meta,rep)},'Editar'),
        S.readOnly?null:el('button',{class:'btn sm danger',onclick:async()=>{
          if (!await confirmBox('Excluir este relatório?',`“${rep.name}” e o agendamento dele serão apagados.`,'Excluir')) return;
          const m=structuredClone(meta); m.reports=(m.reports||[]).filter(x=>x.id!==rep.id); persistCharts(m); toast('Relatório excluído.'); }},'Excluir'))));
  }
  view.append(grid);
}

export { PERIODS, WEEKDAYS, emailOk, fmtNext, fmtPhone, isTouch, isoDay, nextRun, pdfReady, periodRange, periodText, phoneDigits, phoneOk, renderReports, reportDialog, reportDownload, reportEmail, reportPdf, reportRows, reportSpecs, reportText, reportWhats, safePdf, scheduleText, sendDialog, whatsPick };
