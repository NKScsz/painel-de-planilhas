const fs=require('fs');
const edit=(f,pairs)=>{ let s=fs.readFileSync(f,'utf8'); for(const [a,b] of pairs){ if(!s.includes(a)) throw new Error(f+': '+a.slice(0,80)); s=s.split(a).join(b); } fs.writeFileSync(f,s); };
// ?v=2: endereço novo para o cache antigo (sem checagem de origem) não ser reaproveitado
let h=fs.readFileSync('index.html','utf8');
h=h.replace(/<script src="(https:\/\/(?:cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|www\.gstatic\.com)[^"?]+)" integrity=/g,'<script src="$1?v=2" integrity=');
fs.writeFileSync('index.html',h);
edit('src/import/pdf-image.js',[["    const s=document.createElement('script'); s.src=src; s.onload=ok;\n    if (SRI[src]){ s.integrity=SRI[src]; s.crossOrigin='anonymous'; }",
 "    const s=document.createElement('script'); s.onload=ok;\n    // ?v=2: endereço novo, para o cache antigo do app (guardado sem checagem) não ser reaproveitado\n    if (SRI[src]){ s.src=src+'?v=2'; s.integrity=SRI[src]; s.crossOrigin='anonymous'; } else s.src=src;"]]);
edit('public/sw.js',[["const VERSION = 'pp-v3';","const VERSION = 'pp-v4';"],
 ["const CDN = /^(cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|www\.gstatic\.com|","const CDN = /^(cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|cdn\.sheetjs\.com|www\.gstatic\.com|"],
 ["    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {\n      if (res.ok || res.type === 'opaque') {",
  "    // bibliotecas com impressão digital (SRI) pedem modo cors: uma cópia opaca guardada não serve\n    e.respondWith(caches.match(req).then(hit => (hit && !(req.mode === 'cors' && hit.type === 'opaque')) ? hit : fetch(req).then(res => {\n      if (res.ok || (res.type === 'opaque' && req.mode !== 'cors')) {"]]);
