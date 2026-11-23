import { currentMeta } from '../app/init.js';
import { S } from '../core/state.js';
import { handleWriteError } from '../core/storage.js';
import { el, toast } from '../core/utils.ts';
import { fld } from './extras.js';
import { scheduleShare } from './share.js';

/* ----- Marca própria nos relatórios, apresentações e links ----- */
function brand(){
  const pf=S.profile||{}, b=pf.brand||{}, ok=/^#[0-9a-f]{6}$/i.test(b.color||'');
  return {name:String(b.name||pf.company||'').trim(),color:ok?b.color.toLowerCase():'#2962ff',custom:ok,logo:b.logo||'',lw:b.lw||0,lh:b.lh||0};
}
const hexRgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
const lum=h=>{ const [r,g,b]=hexRgb(h).map(v=>{ v/=255; return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4; }); return 0.2126*r+0.7152*g+0.0722*b; };
const mixRgb=(a,b,t)=>a.map((v,i)=>Math.round(v+(b[i]-v)*t));
const rgbHex=a=>a.map(v=>v.toString(16).padStart(2,'0')).join('').toUpperCase();
// tamanho do logo dentro de uma caixa (mantém a proporção)
const logoFit=(br,maxW,maxH)=>{ const r=br.lw&&br.lh?br.lw/br.lh:3; let w=maxH*r, h=maxH; if(w>maxW){ w=maxW; h=w/r; } return {w,h}; };
async function readLogo(file){
  if (file.size>4e6) throw new Error('Arquivo muito grande (máximo 4 MB).');
  const url=URL.createObjectURL(file);
  try{
    const img=new Image(); img.src=url; await img.decode();
    let w=img.naturalWidth||300, h=img.naturalHeight||100; const k=Math.min(1,480/w,160/h); w=Math.max(1,Math.round(w*k)); h=Math.max(1,Math.round(h*k));
    const cv=el('canvas',{width:w,height:h}); cv.getContext('2d').drawImage(img,0,0,w,h);
    return {logo:cv.toDataURL('image/png'),lw:w,lh:h};
  } finally { URL.revokeObjectURL(url); }
}
function brandCard(){
  const pf=S.profile||{}, b=pf.brand||{};
  const st={name:b.name||'',color:/^#[0-9a-f]{6}$/i.test(b.color||'')?b.color:'#2962ff',logo:b.logo||'',lw:b.lw||0,lh:b.lh||0};
  const nameIn=el('input',{value:st.name,placeholder:pf.company||'Nome da sua empresa ou marca',maxlength:60});
  const colorIn=el('input',{type:'color',value:st.color,class:'color-in'});
  const fileIn=el('input',{type:'file',accept:'image/png,image/jpeg,image/webp,image/svg+xml',style:'display:none'});
  const err=el('div',{class:'form-err'}), prev=el('div',{class:'brand-prev'}), logoBox=el('div',{class:'brand-logo'});
  const saveBtn=el('button',{class:'btn primary',disabled:true},'Salvar marca');
  const changed=()=>{ S.brandDirty=true; saveBtn.disabled=false; draw(); };
  const draw=()=>{
    const c=colorIn.value, dark=lum(c)>0.55, nm=nameIn.value.trim()||pf.company||'Sua empresa';
    logoBox.innerHTML='';
    logoBox.append(st.logo?el('img',{src:st.logo,alt:'Logo'}):el('span',{class:'muted',text:'Sem logo'}),
      el('div',{class:'bl-btns'},el('button',{class:'btn sm',onclick:()=>fileIn.click()},st.logo?'Trocar logo':'Enviar logo'),st.logo?el('button',{class:'btn sm',onclick:()=>{ st.logo=''; st.lw=st.lh=0; changed(); }},'Remover'):null));
    prev.innerHTML='';
    prev.append(el('div',{class:'bp-head',style:`background:${c};color:${dark?'#111':'#fff'}`},
      el('div',{},el('small',{text:`${nm.toUpperCase()} · RELATÓRIO`}),el('b',{text:'Vendas do mês'})),
      st.logo?el('div',{class:'bp-plate'},el('img',{src:st.logo,alt:''})):null),
      el('div',{class:'bp-body'},el('i',{style:`background:${c}`}),el('span',{text:'Assim fica o topo dos PDFs. A mesma cor e o logo vão para as apresentações e para os links de compartilhamento.'})));
  };
  fileIn.onchange=async()=>{ const f=fileIn.files[0]; fileIn.value=''; if(!f) return; err.textContent='';
    try{ Object.assign(st,await readLogo(f)); changed(); }catch(e){ err.textContent=e.message&&/grande/.test(e.message)?e.message:'Não foi possível ler esta imagem. Use PNG, JPG ou SVG.'; } };
  nameIn.addEventListener('input',changed); colorIn.addEventListener('input',changed);
  saveBtn.onclick=async()=>{
    saveBtn.disabled=true; saveBtn.textContent='Salvando…';
    const data={name:nameIn.value.trim().slice(0,60),color:colorIn.value,logo:st.logo,lw:st.lw,lh:st.lh,updatedAt:Date.now()};
    try{ await S.db.doc(`data/users/${S.uid}/app`).set({profile:{brand:data}},{merge:true}); S.profile={...S.profile,brand:data}; S.brandDirty=false; saveBtn.textContent='Salvar marca'; toast('Marca salva. Ela já aparece nos próximos PDFs e apresentações.');
      const m=currentMeta(); if(m&&m.share) scheduleShare(m); }
    catch(e){ saveBtn.textContent='Salvar marca'; saveBtn.disabled=false; handleWriteError(e); }
  };
  draw();
  return el('div',{class:'p-card brand-card'},
    el('h2',{text:'Sua marca nos relatórios'}),
    el('p',{class:'desc',text:'Coloque seu logo e sua cor nos PDFs, nas apresentações e nos links compartilhados. Seus clientes recebem o material com a sua marca.'}),
    el('div',{class:'form-grid'},fld('Nome da marca',nameIn),el('label',{class:'field'},'Cor principal',el('div',{class:'color-row'},colorIn,el('span',{class:'muted',text:'Use a cor do seu logo'})))),
    el('div',{class:'field',style:'margin-top:12px'},'Logo',logoBox),fileIn,prev,
    el('div',{class:'form-actions'},err,saveBtn));
}

export { brand, brandCard, hexRgb, logoFit, lum, mixRgb, readLogo, rgbHex };
