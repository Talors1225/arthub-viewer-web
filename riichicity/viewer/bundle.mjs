import {unzip,unzipSync} from '../../common/vendor/fflate-0.8.3.mjs';

const MAX_BYTES=512*1024*1024,MAX_FILES=4096;
const imageType=name=>({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',json:'application/json'}[name.split('.').pop().toLowerCase()]||'application/octet-stream');
export function normalizePath(value) {
  const text=String(value).replaceAll('\\','/');
  if(!text||/\0|^[a-z][a-z\d+.-]*:|^\//i.test(text))throw Error('不支持的资源路径：'+value);
  const parts=[];
  for(const part of text.split('/')){if(!part||part==='.')continue;if(part==='..'){if(!parts.length)throw Error('资源路径超出所选文件夹：'+value);parts.pop();}else parts.push(part);}
  if(!parts.length)throw Error('资源路径为空');return parts.join('/');
}
export function relativePath(owner,reference) {
  const ref=String(reference);
  if(/\0|^[a-z][a-z\d+.-]*:|^[\\/]/i.test(ref))throw Error('模型必须引用所选文件中的资源：'+reference);
  return normalizePath(owner.slice(0,owner.lastIndexOf('/')+1)+ref);
}
export function spineVersion(bytes) {
  // Spine 4 stores an eight-byte hash followed by a varint UTF-8 string.
  let offset=8,length=0,shift=0;
  while(offset<bytes.length&&shift<35){const value=bytes[offset++];length|=(value&127)<<shift;if(!(value&128))break;shift+=7;}
  if(length>1&&length<64&&offset+length-1<=bytes.length){const version=new TextDecoder().decode(bytes.slice(offset,offset+length-1));if(/^4\.\d+\.\d+(?:-[a-z\d]+)?$/i.test(version))return version;}
  const header=new TextDecoder().decode(bytes.slice(0,180));
  return header.match(/(?:^|[^\d])((?:3|4)\.\d+\.\d+(?:-[a-z\d]+)?)/i)?.[1]||'';
}
export class LocalBundle {
  constructor(records){
    this.files=new Map();this.urls=new Map();this.folded=new Map();this.basenames=new Map();this.disposed=false;let total=0;
    for(const {path:name,file} of records){
      const key=normalizePath(name);if(/(^|\/)__MACOSX\//.test(key)||key.split('/').pop().startsWith('._'))continue;
      if(this.files.has(key))throw Error('存在重复文件路径：'+key);
      total+=file.size;if(total>MAX_BYTES||this.files.size>=MAX_FILES)throw Error('所选资源过多，请只导入当前立绘需要的文件（最多 512 MB / 4096 个文件）');
      this.files.set(key,file);
      for(const [map,k]of [[this.folded,key.toLowerCase()],[this.basenames,key.split('/').pop().toLowerCase()]])map.set(k,[...(map.get(k)||[]),key]);
    }
    this.bytes=total;
  }
  resolve(owner,reference){
    const candidate=relativePath(owner,reference);
    if(this.files.has(candidate))return candidate;
    const near=this.folded.get(candidate.toLowerCase())||[];if(near.length===1)return near[0];
    const flat=this.basenames.get(candidate.split('/').pop().toLowerCase())||[];
    if(flat.length===1)return flat[0];
    if(near.length>1||flat.length>1)throw Error('同名文件无法确定对应关系，请选择完整文件夹或 ZIP：'+reference);
    throw Error('缺少文件：'+reference);
  }
  async json(name){const file=this.files.get(name);if(!file)throw Error('缺少文件：'+name);if(file.size>32*1024*1024)throw Error('JSON 文件过大：'+name);try{return JSON.parse(await file.text());}catch(e){throw Error('JSON 无法读取：'+name);}}
  url(name){
    if(this.disposed)throw Error('本地资源已关闭，请重新选择');
    if(!this.files.has(name))throw Error('缺少文件：'+name);
    if(!this.urls.has(name)){const file=this.files.get(name);this.urls.set(name,URL.createObjectURL(new Blob([file],{type:file.type||imageType(name)})));}
    return this.urls.get(name);
  }
  createURL(data){const url=URL.createObjectURL(data);this.urls.set(Symbol(),url);return url;}
  dispose(){for(const url of this.urls.values())URL.revokeObjectURL(url);this.urls.clear();this.disposed=true;}
}
export async function bundleFromFiles(files) {
  const list=[...files];
  return new LocalBundle(list.map(file=>({path:file.webkitRelativePath||file.relativePath||file.name,file})));
}
export async function readZip(file) {
  if(file.size>MAX_BYTES)throw Error('ZIP 过大，请仅打包当前立绘');
  let bytes=0,count=0;const names=new Set(),input=new Uint8Array(await file.arrayBuffer());
  const options={filter:entry=>{
      if(entry.name.endsWith('/'))return false;
      const name=normalizePath(entry.name);if(names.has(name))throw Error('ZIP 中有重复路径：'+name);names.add(name);
      bytes+=entry.originalSize;if(++count>MAX_FILES||bytes>MAX_BYTES)throw Error('ZIP 解压后过大，请只打包当前立绘');
      return true;
    }};
  const contents=await new Promise((resolve,reject)=>{
    try{if(typeof Worker==='undefined')resolve(unzipSync(input,options));else unzip(input,options,(error,result)=>error?reject(Error('ZIP 无法读取：'+error.message)):resolve(result));}catch(error){reject(error);}
  });
  return new LocalBundle(Object.entries(contents).map(([name,data])=>({path:name,file:new Blob([data],{type:imageType(name)})})));
}
export async function importBundle(files) {return files.length===1&&/\.zip$/i.test(files[0].name)?readZip(files[0]):bundleFromFiles(files);}
export async function discoverModels(bundle) {
  const models=[],issues=[],paths=[...bundle.files.keys()];
  const atlases=paths.filter(p=>/\.atlas(?:\.txt)?$/i.test(p));
  for(const path of paths){
    try{
      let json=null,version='',format='binary';
      if(/\.json$/i.test(path)&&!/(?:motion3|exp3|physics3|pose3|cdi3)\.json$/i.test(path)){
        try{json=await bundle.json(path);}catch(e){if(/model3\.json$/i.test(path))issues.push(e.message);continue;}
        if(json?.FileReferences?.Moc){
          const refs=json.FileReferences,required=[refs.Moc,...(refs.Textures||[])];
          for(const ref of required)bundle.resolve(path,ref);
          models.push({path,name:path.split('/').pop().replace(/\.model3\.json$/i,''),type:'live2d',json,version:'Cubism 4'});continue;
        }
        if(!Array.isArray(json?.bones)||!json?.skeleton?.spine)continue;
        version=String(json.skeleton.spine);format='json';
      }else if(/\.(?:skel|skel\.bytes|skel\.txt)$/i.test(path))version=spineVersion(new Uint8Array(await bundle.files.get(path).slice(0,180).arrayBuffer()));
      else continue;
      if(!/^(?:3\.8|4\.[012])(?:\.|$)/.test(version)){issues.push(path+'：暂不支持 Spine '+(version||'未知版本')+'，当前支持 3.8 / 4.0 / 4.1 / 4.2');continue;}
      const stem=path.replace(/\.(?:json|skel(?:\.(?:bytes|txt))?)$/i,''),same=atlases.filter(p=>p.replace(/\.atlas(?:\.txt)?$/i,'')===stem);
      const siblings=atlases.filter(p=>p.slice(0,p.lastIndexOf('/'))===path.slice(0,path.lastIndexOf('/')));
      let atlas=same[0];if(!atlas&&siblings.length===1)atlas=siblings[0];if(!atlas&&atlases.length===1)atlas=atlases[0];
      if(!atlas)throw Error('缺少或无法确定图集 .atlas：'+path);
      models.push({path,name:path.split('/').pop().replace(/\.(?:json|skel(?:\.(?:bytes|txt))?)$/i,''),type:'spine',format,atlas,version,json});
    }catch(error){issues.push(error.message);}
  }
  return {models,issues};
}
export async function liveDefinition(bundle,model) {
  const data=structuredClone(model.json),refs=data.FileReferences,warnings=[];
  const link=ref=>bundle.url(bundle.resolve(model.path,ref));
  refs.Moc=link(refs.Moc);refs.Textures=refs.Textures.map(link);
  for(const key of ['Physics','Pose','UserData','DisplayInfo'])if(refs[key]){try{refs[key]=link(refs[key]);}catch(e){warnings.push(e.message);delete refs[key];}}
  for(const [group,motions]of Object.entries(refs.Motions||{}))refs.Motions[group]=motions.flatMap(m=>{try{const localPath=bundle.resolve(model.path,m.File),item={...m,File:bundle.url(localPath),_localPath:localPath};if(item.Sound){try{item.Sound=link(item.Sound);}catch(e){warnings.push(e.message);delete item.Sound;}}return [item];}catch(e){warnings.push(e.message);return [];}});
  if(refs.Expressions)refs.Expressions=refs.Expressions.flatMap(e=>{try{return [{...e,File:link(e.File)}];}catch(error){warnings.push(error.message);return [];}});
  data.url=new URL('local-model.json',location.href).href;
  return {data,warnings};
}
