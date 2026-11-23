/* ============ Estado ============ */
const S = {
  db:null, uid:null, me:null, mode:'loading', // loading | login | setup | cloud | local
  auth:null, unsubBases:null,
  view:'home', // home | base | perfil | modelo
  profile:{}, profileDirty:false, unsubProfile:null, authUser:null,
  model:{relationships:[],positions:{}}, rowCache:{},
  bases:[], basesLoaded:false,
  currentId:null, rows:null, loadingRows:false,
  tab: ({'#graficos':'graficos','#relatorios':'relatorios','#apresentacao':'apresentacao'})[location.hash]||'dados', deckCfg:{},
  page:0, pageSize:50, sort:{col:-1,dir:1}, search:'',
  dirty:false, readOnly:false,
  vfilter:{col:'',val:'',from:'',to:''},
  uploadMode:'new', // new | replace | append
  local:{} // id -> {meta, rows} quando sem login
};
const charts = []; // instâncias Chart.js ativas
// "downloads" é criado em app/init.js

export { S, charts };
