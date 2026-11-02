import {LocalBundle} from './bundle.mjs?v=20261102-riichi-r2-1';
import {createVoicePanel} from './voices.mjs?v=20261102-riichi-r2-1';

export async function fetchModelBundle(model,signal,assetBase='/riichicity/assets/'){
 const paths=[...new Set([model.path,model.atlas,...model.pages])];
 const records=await Promise.all(paths.map(async path=>{
  if(!path||path.includes('\\')||path.startsWith('/')||path.split('/').some(p=>!p||p==='..'||p==='.')||/^[a-z][a-z\d+.-]*:/i.test(path))throw Error('资源路径无效');
  const response=await fetch(assetBase+path.split('/').map(encodeURIComponent).join('/'),{signal});
  if(!response.ok)throw Error('本地资源读取失败（'+response.status+'）：'+path.split('/').pop());
  return {path,file:await response.blob()};
 }));
 return new LocalBundle(records);
}

export async function createCatalog({selectModel,status}){
 const response=await fetch('../characters.json');
 if(!response.ok)throw Error('未连接麻雀一番街资源，请回到首页重新查找资源。');
 const catalog=await response.json();
 if(catalog.game!=='riichicity'||!Array.isArray(catalog.characters)||!catalog.characters.length)throw Error('麻雀一番街资源目录为空。');
 const $=id=>document.getElementById(id),K=window.SpineKit,characters=catalog.characters,models=characters.flatMap(c=>c.variants);
 const voicePanel=createVoicePanel(catalog.assetBase);
 let entryRequested=false;
 const choose=model=>{entryRequested=true;selectModel(model);};
 const query=new URL(location.href).searchParams;
 let role=characters.some(c=>c.id===query.get('character'))?query.get('character'):'',mode='skins',selected=null,page=1,descending=false;
 const select=$('characterSelect'),search=$('gridSearch'),list=$('thumbGrid');
 select.replaceChildren(new Option('全部角色',''),...characters.map(c=>new Option(c.name,c.id)));
 $('modelSection').hidden=false;
 function favorite(item,isRole=false){return {k:'riichicity:'+(isRole?'role:':'')+item.id,src:'riichicity',t:item.name,s:isRole?'角色':item.skin,u:location.pathname+'?'+(isRole?'character=':'id=')+encodeURIComponent(item.id)};}
 function matches(model,q){return !q||(model.name+' '+model.id).toLocaleLowerCase().includes(q);}
 function imageCard(item,title,subtitle,action,flagged=false,isRole=false){
  const card=document.createElement('div');card.className='thumb-card';card.setAttribute('role','button');card.tabIndex=0;
  const art=document.createElement('span');art.className='ph';
  const image=document.createElement('img');image.src=(item.auxiliary?models.find(m=>m.skinKey===item.skinKey&&!m.auxiliary)?.thumbnail:null)||item.thumbnail;image.loading='lazy';image.alt=title;image.decoding='async';
  const fallback=document.createElement('span');fallback.className='catalog-fallback';fallback.textContent=title.slice(0,1);fallback.hidden=true;
  image.onerror=()=>{image.hidden=true;fallback.hidden=false;};art.append(image,fallback);
  const text=document.createElement('span');text.className='tm';
  const label=document.createElement('span');label.className='tn';label.textContent=title;
  const description=document.createElement('span');description.className='ts';description.textContent=subtitle;text.append(label,description);
  const tag=document.createElement('span');tag.className='tt'+(flagged?' catalog-warning':'');tag.textContent=flagged?'部分动作待适配':subtitle;
  const entry=favorite(item,isRole),star=document.createElement('button');star.type='button';star.className='tstar';const saved=K.favs.has(entry.k);star.classList.toggle('on',saved);star.title=saved?'取消收藏':'收藏';star.setAttribute('aria-label',star.title);star.setAttribute('aria-pressed',String(saved));star.innerHTML=K.uiIcon('star',18,saved);
  star.onclick=event=>{event.stopPropagation();K.favs.toggle(entry);render();};
  card.append(tag,art,text,star);card.onclick=action;card.onkeydown=event=>{if((event.key==='Enter'||event.key===' ')&&!event.target.closest('.tstar')){event.preventDefault();action();}};return card;
 }
 function render(current=selected){
  selected=current;select.value=role;
  const q=search.value.trim().toLocaleLowerCase(),fragment=document.createDocumentFragment();
  const isRole=false;
  let rows=models.filter(m=>(!role||m.roleId===role)&&matches(m,q)&&(mode!=='favorites'||K.favs.has(favorite(m).k)||K.favs.has('riichicity:role:'+m.roleId)));
  if($('catalogSort').value==='name')rows.sort((a,b)=>(a.name||'').localeCompare(b.name||'','zh-CN'));
  if(descending)rows.reverse();
  const pageSize=K.libraryPageSize?.()||120,totalPages=Math.max(1,Math.ceil(rows.length/pageSize));page=Math.max(1,Math.min(totalPages,page));
  for(const item of rows.slice((page-1)*pageSize,page*pageSize)){
   const groupCard=Array.isArray(item.variants);
   const card=groupCard?imageCard(item,item.name,item.skinCount+' 套皮肤',()=>{role=item.id;mode='skins';page=1;render();},false,true):imageCard(item,role?item.skin:item.name,item.auxiliary?'附属层':item.animations.length+' 个动作',()=>choose(item),item.needsReview);
   card.dataset[groupCard?'role':'model']=item.id;card.classList.toggle('active',!groupCard&&selected?.id===item.id);fragment.append(card);
  }
  $('catalogSummary').textContent='麻雀一番街 · '+(role?characters.find(c=>c.id===role).name+' · ':'')+catalog.stats.characters+' 位角色 · '+catalog.stats.skins+' 套皮肤';
  for(const button of document.querySelectorAll('[data-catalog-tab]'))button.classList.toggle('on',button.dataset.catalogTab===mode);
  $('favorites').querySelector('.n').textContent=models.filter(m=>K.favs.has(favorite(m).k)).length+characters.filter(c=>K.favs.has(favorite(c,true).k)).length;
  $('catalogHeading').textContent=isRole?'全部角色':role?characters.find(c=>c.id===role).name:'全部皮肤';
  $('catalogEmpty').hidden=rows.length>0;list.replaceChildren(fragment);
  for(const nav of K.paginationHosts($('gridView'))){nav.replaceChildren();nav.hidden=totalPages<=1;if(totalPages<=1)continue;for(let p=1;p<=totalPages;p++){const button=document.createElement('button');button.type='button';button.className='grid-page-btn'+(p===page?' on':'');button.textContent=p;if(p===page)button.setAttribute('aria-current','page');button.onclick=()=>{page=p;render();$('gridView').scrollTo({top:0});};nav.append(button);}}
  K.refreshLibraryUI?.();
 }
 select.onchange=()=>{role=select.value;mode='skins';page=1;render();};search.oninput=()=>{page=1;render();};
 $('allCharacters').onclick=()=>{role='';mode='skins';search.value='';page=1;render();};
 $('allSkins').onclick=()=>{role='';mode='skins';page=1;render();};$('favorites').onclick=()=>{role='';mode='favorites';page=1;render();};
 $('catalogSort').onchange=()=>{page=1;render();};$('catalogSortDir').onclick=()=>{descending=!descending;$('catalogSortDir').textContent=descending?'降序':'升序';page=1;render();};
 matchMedia('(max-width:720px)').addEventListener('change',()=>{page=1;render();});
 K.initLibraryUsability?.();K.initLibraryUI?.();render();status('点击立绘即可播放。');
 return {models,render,voicePanel,fetchBundle:(model,signal)=>fetchModelBundle(model,signal,catalog.assetBase),
  loaded(model,engine){selected=model;render();voicePanel.setModel(model,engine,entryRequested);entryRequested=false;const url=new URL(location.href);if(role)url.searchParams.set('character',role);else url.searchParams.delete('character');url.searchParams.set('id',model.id);history.replaceState(null,'',url);},
  step(delta){const choices=models.filter(m=>(!role||m.roleId===role)&&!m.auxiliary);const at=choices.findIndex(m=>m.id===selected?.id);if(choices.length)choose(choices[(at+delta+choices.length)%choices.length]);},
  initial:models.find(m=>m.id===new URL(location.href).searchParams.get('id'))||null};
}
