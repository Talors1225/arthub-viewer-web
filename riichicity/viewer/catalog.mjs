import {LocalBundle} from './bundle.mjs?v=20261104-unified-final';
import {createVoicePanel} from './voices.mjs?v=20261104-unified-final';

export async function fetchModelBundle(model,signal,assetBase='/riichicity/assets/'){
 const paths=[...new Set([model.path,model.atlas,...model.pages])];
 for(const path of paths)if(!path||path.includes('\\')||path.startsWith('/')||path.split('/').some(p=>!p||p==='..'||p==='.')||/^[a-z][a-z\d+.-]*:/i.test(path))throw Error('资源路径无效');
 const controller=new AbortController(),abort=()=>controller.abort(signal.reason);
 if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
 const timeout=setTimeout(()=>controller.abort(Error('立绘加载超时，请检查网络后重试')),60000);
 try{
  const records=await Promise.all(paths.map(async path=>{
   const response=await fetch(assetBase+path.split('/').map(encodeURIComponent).join('/'),{signal:controller.signal});
   if(!response.ok)throw Error('资源读取失败（'+response.status+'）：'+path.split('/').pop());
   return {path,file:await response.blob()};
  }));
  if(controller.signal.aborted)throw controller.signal.reason;
  return new LocalBundle(records);
 }catch(error){controller.abort();throw error;}
 finally{clearTimeout(timeout);signal?.removeEventListener('abort',abort);}
}

export function paginationItems(page,total){
 const pages=new Set([1,total,page-1,page,page+1]);if(page<=2)pages.add(3);if(page>=total-1)pages.add(total-2);
 const result=[];for(const n of [...pages].filter(n=>n>=1&&n<=total).sort((a,b)=>a-b)){if(result.length&&n-result.at(-1)>1)result.push(null);result.push(n);}return result;
}
export function modelPreviewPath(model,models){return(model.auxiliary?models.find(item=>item.skinKey===model.skinKey&&!item.auxiliary)?.thumbnail:null)||model.thumbnail;}

// The chess-piece layer has no visible attachments without the game logic.
const chessLayerId='spine_1000905__haixia-tunvlang2',chessPortraitId='spine_1000905__haixia-tunvlang';

export async function createCatalog({selectModel,status}){
 const catalog=await window.SpineKit.fetchJSON('../characters.json',{timeout:20000});
 if(catalog.game!=='riichicity'||!Array.isArray(catalog.characters)||!catalog.characters.length)throw Error('麻雀一番街资源目录为空。');
 const $=id=>document.getElementById(id),K=window.SpineKit,characters=catalog.characters;
 const models=characters.flatMap(c=>c.variants).filter(model=>model.id!==chessLayerId);
 const chessPortrait=models.find(model=>model.id===chessPortraitId);
 const chessLayerFavorite=K.favs.list().find(item=>item.k==='riichicity:'+chessLayerId);
 if(chessPortrait&&chessLayerFavorite){
  K.favs.toggle(chessLayerFavorite);
  const entry=favorite(chessPortrait);
  if(!K.favs.has(entry.k))K.favs.toggle(entry);
 }
 const voicePanel=createVoicePanel(catalog.assetBase);
 let entryRequested=false,navigationModel=null;
 const choose=model=>{entryRequested=true;navigationModel=model;selectModel(model);};
 const query=new URL(location.href).searchParams;
 const initialId=query.get('id');
 let role=characters.some(c=>c.id===query.get('character'))?query.get('character'):'',mode='skins',selected=null,page=1,descending=false;
 const railStar=document.createElement('button');railStar.id='railStar';railStar.type='button';railStar.disabled=true;
 $('rail').insertBefore(railStar,$('homeAction'));
 function syncStar(){const on=!!selected&&K.favs.has(favorite(selected).k);railStar.disabled=!selected;railStar.classList.toggle('on',on);railStar.setAttribute('aria-pressed',String(on));railStar.title=on?'取消收藏 (S)':'收藏 (S)';railStar.setAttribute('aria-label',railStar.title);railStar.dataset.actionLabel=on?'已收藏':'收藏';railStar.innerHTML=K.uiIcon('star',18,on);}
 railStar.onclick=()=>{if(selected){K.favs.toggle(favorite(selected));render();}};
 const select=$('characterSelect'),search=$('gridSearch'),list=$('thumbGrid');
 select.replaceChildren(new Option('全部角色',''),...characters.map(c=>new Option(c.name,c.id)));
 $('modelSection').hidden=false;
 function favorite(item,isRole=false){return {k:'riichicity:'+(isRole?'role:':'')+item.id,src:'riichicity',t:item.name,s:isRole?'角色':item.skin,u:location.pathname+'?'+(isRole?'character=':'id=')+encodeURIComponent(item.id)};}
 function matches(model,q){return !q||(model.name+' '+model.skin+' '+model.id).toLocaleLowerCase().includes(q);}
 function previewPath(item){return modelPreviewPath(item,models);}
 function imageCard(item,title,subtitle,action,flagged=false,isRole=false){
  const card=document.createElement('div');card.className='thumb-card';card.setAttribute('role','button');card.tabIndex=0;
  const art=document.createElement('span');art.className='ph';
  const image=document.createElement('img');image.src=previewPath(item);image.loading='lazy';image.alt=title;image.decoding='async';
  const fallback=document.createElement('span');fallback.className='catalog-fallback';fallback.textContent=title.slice(0,1);fallback.hidden=true;
  image.onerror=()=>{image.hidden=true;fallback.hidden=false;};art.append(image,fallback);
  const text=document.createElement('div');text.className='tm';
  const label=document.createElement('span');label.className='tn';label.textContent=title;
  const description=document.createElement('span');description.className='ts';description.textContent=subtitle;text.append(label,description);
  const tag=document.createElement('span');tag.className='tt'+(flagged?' catalog-warning':'');tag.textContent=flagged?'部分动作待适配':subtitle;
  const entry=favorite(item,isRole),star=document.createElement('button');star.type='button';star.className='tstar';const saved=K.favs.has(entry.k);star.classList.toggle('on',saved);star.title=saved?'取消收藏':'收藏';star.setAttribute('aria-label',star.title);star.setAttribute('aria-pressed',String(saved));star.innerHTML=K.uiIcon('star',18,saved);
  star.onclick=event=>{event.stopPropagation();K.favs.toggle(entry);render();};
  card.append(tag,art,text,star);card.onclick=action;card.onkeydown=event=>{if((event.key==='Enter'||event.key===' ')&&!event.target.closest('.tstar')){event.preventDefault();action();}};return card;
 }
 function matchingRows(){
  const q=search.value.trim().toLocaleLowerCase();let rows=models.filter(m=>(!role||m.roleId===role)&&matches(m,q)&&(mode!=='favorites'||K.favs.has(favorite(m).k)||K.favs.has('riichicity:role:'+m.roleId)));
  if($('catalogSort').value==='name')rows.sort((a,b)=>(a.name||'').localeCompare(b.name||'','zh-CN',{numeric:true}));
  if(descending)rows.reverse();return rows;
 }
 function render(current=selected){
  selected=current;select.value=role;
  syncStar();
  const q=search.value.trim().toLocaleLowerCase(),fragment=document.createDocumentFragment();
  const isRole=false;
  const rows=matchingRows();
  const pageSize=K.libraryPageSize?.()||120,totalPages=Math.max(1,Math.ceil(rows.length/pageSize));page=Math.max(1,Math.min(totalPages,page));
  for(const item of rows.slice((page-1)*pageSize,page*pageSize)){
   const groupCard=Array.isArray(item.variants);
   const card=groupCard?imageCard(item,item.name,item.skinCount+' 套皮肤',()=>{role=item.id;mode='skins';page=1;render();},false,true):imageCard(item,role?item.skin:item.name,item.auxiliary?'附属层':item.animations.length+' 个动作',()=>choose(item),item.needsReview);
   card.dataset[groupCard?'role':'model']=item.id;card.classList.toggle('active',!groupCard&&selected?.id===item.id);fragment.append(card);
  }
  $('catalogSummary').textContent=rows.length+' 个资源 · 第 '+page+' / '+totalPages+' 页 · 麻雀一番街 · '+(role?characters.find(c=>c.id===role).name+' · ':'')+catalog.stats.characters+' 位角色 · '+catalog.stats.skins+' 套皮肤';
  for(const button of document.querySelectorAll('[data-catalog-tab]'))button.classList.toggle('on',button.dataset.catalogTab===mode);
  $('favorites').querySelector('.n').textContent=models.filter(m=>K.favs.has(favorite(m).k)||K.favs.has('riichicity:role:'+m.roleId)).length;
  $('catalogHeading').textContent=isRole?'全部角色':role?characters.find(c=>c.id===role).name:'全部皮肤';
  $('catalogEmpty').hidden=rows.length>0;list.replaceChildren(fragment);
  for(const nav of K.paginationHosts($('gridView'))){
   nav.replaceChildren();nav.hidden=totalPages<=1;if(totalPages<=1)continue;
   const add=(p,label,disabled=false)=>{const button=document.createElement('button');button.type='button';button.className='grid-page-btn'+(p===page&&!label?' on':'');button.textContent=label||p;button.disabled=disabled;
    if(!label&&p===page)button.setAttribute('aria-current','page');button.setAttribute('aria-label',label?(label==='‹'?'上一页':'下一页'):'第 '+p+' 页');button.onclick=()=>{page=p;render();$('gridView').scrollTo({top:0});};nav.append(button);};
   add(page-1,'‹',page===1);
   for(const p of paginationItems(page,totalPages)){if(p===null){const gap=document.createElement('span');gap.className='grid-page-gap';gap.textContent='…';nav.append(gap);}else add(p);}
   add(page+1,'›',page===totalPages);
  }
  K.refreshLibraryUI?.();
 }
 select.onchange=()=>{role=select.value;mode='skins';page=1;render();};search.oninput=()=>{page=1;render();};
 $('allCharacters').onclick=()=>{role='';mode='skins';search.value='';page=1;render();};
 $('allSkins').onclick=()=>{role='';mode='skins';page=1;render();};$('favorites').onclick=()=>{role='';mode='favorites';page=1;render();};
 $('catalogSort').onchange=()=>{page=1;render();};$('catalogSortDir').onclick=()=>{descending=!descending;$('catalogSortDir').textContent=descending?'降序':'升序';$('catalogSortDir').title=descending?'当前降序':'当前升序';page=1;render();};
 matchMedia('(max-width:720px)').addEventListener('change',()=>{page=1;render();});
 K.initLibraryUsability?.();K.initLibraryUI?.();render();status('点击立绘即可播放。');
 return {models,render,voicePanel,previewPath,fetchBundle:(model,signal)=>fetchModelBundle(model,signal,catalog.assetBase),
  loaded(model,engine){selected=navigationModel=model;render();voicePanel.setModel(model,engine,entryRequested);entryRequested=false;const url=new URL(location.href);if(role)url.searchParams.set('character',role);else url.searchParams.delete('character');url.searchParams.set('id',model.id);history.replaceState(null,'',url);},
  cancelNavigation(){navigationModel=selected;entryRequested=false;},
  step(delta){const choices=matchingRows().filter(m=>!m.auxiliary);const at=choices.findIndex(m=>m.id===(navigationModel||selected)?.id);if(choices.length)choose(choices[at<0?(delta<0?choices.length-1:0):(at+delta+choices.length)%choices.length]);},
  initial:(initialId===chessLayerId?chessPortrait:models.find(m=>m.id===initialId))||null};
}
