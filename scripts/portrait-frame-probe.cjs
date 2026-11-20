'use strict';

// Find the largest axis-aligned rectangle backed by opaque artwork.
// Coordinates use the exclusive right and bottom edges of the sampling grid.
function largestOpaqueRectangle(mask, width, height) {
 const heights = new Int32Array(width + 1), stack = [];
 let best = null, area = 0;
 for (let y = 0; y < height; y++) {
  stack.length = 0;
  for (let x = 0; x <= width; x++) {
   if (x < width) heights[x] = mask[y * width + x] ? heights[x] + 1 : 0;
   while (stack.length && heights[stack.at(-1)] > heights[x]) {
    const rows = heights[stack.pop()];
    const left = stack.length ? stack.at(-1) + 1 : 0;
    const size = rows * (x - left);
    if (size > area) {
     area = size;
     best = { left, top: y + 1 - rows, right: x, bottom: y + 1, area };
    }
   }
   stack.push(x);
  }
 }
 return best;
}

// Executed inside the local viewer. Read the transparent drawing surface before
// the site's backdrop is added, so the color selected by the viewer is irrelevant.
function makeFrameProbe() {
 const scratch = document.createElement('canvas');
 const ctx = scratch.getContext('2d', { willReadFrequently:true });
 return (source, respectClip = false, transform = null) => {
  let left = 0, top = 0, width = source.width, height = source.height;
  if (respectClip) {
   const inset = /^inset\((.+)\)$/.exec(source.style.clipPath)?.[1].match(/[\d.]+px/g)?.map(parseFloat);
   if (inset?.length) {
    const [t, r = t, b = t, l = r] = inset;
    const sx = width / source.clientWidth, sy = height / source.clientHeight;
    left = l * sx; top = t * sy; width -= (l + r) * sx; height -= (t + b) * sy;
   }
  }
  if (!(width > 1 && height > 1)) return { empty:true };
  const scale = Math.min(1, 144 / Math.max(width, height));
  scratch.width = Math.max(2, Math.round(width * scale));
  scratch.height = Math.max(2, Math.round(height * scale));
  const w = scratch.width, h = scratch.height;
  ctx.drawImage(source, left, top, width, height, 0, 0, w, h);
  const pixels = ctx.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1, painted = 0, dark = 0, picture = 0;
  const artwork = transform ? {transform, positions:[], bounds:[]} : null;
  const cssX=source.clientWidth/source.width, cssY=source.clientHeight/source.height;
  if(artwork)artwork.bounds=[left*cssX,top*cssY,(left+width)*cssX,(top+height)*cssY];
  const black = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
   const offset = (y * w + x) * 4;
   if (pixels[offset + 3] < 190) continue;
   painted++;
   x0 = Math.min(x0,x); x1 = Math.max(x1,x); y0 = Math.min(y0,y); y1 = Math.max(y1,y);
   const value = Math.max(pixels[offset],pixels[offset+1],pixels[offset+2]);
   if (value <= 10) { dark++; black[y * w + x] = 1; }
   if (value >= 24) {
    picture++;
    if(artwork && x%2===0 && y%2===0) artwork.positions.push((left+(x+.5)*width/w)*cssX,(top+(y+.5)*height/h)*cssY);
   }
  }
  if (painted < 16) return { empty:true };
 const side = (axis, reverse) => {
   const length = axis ? y1-y0+1 : x1-x0+1;
   const depth = axis ? x1-x0+1 : y1-y0+1;
   const from = Math.floor(length*.12), to = Math.ceil(length*.88);
  let best = 0, flatRows = 0, contiguous = true;
  let borderColor = null;
   for (let line = 0; line < Math.max(1,Math.round(depth*.07)); line++) {
    let sum = 0, matches = 0;
    for (let p = from; p < to; p++) {
     const x = axis ? (reverse ? x1-line : x0+line) : x0+p;
     const y = axis ? y0+p : (reverse ? y1-line : y0+line);
     const index = y*w+x, offset=index*4;
     sum += black[index];
     if (line===0 && p===from) borderColor = Array.from(pixels.subarray(offset,offset+4));
     if (borderColor[3]>=190 && pixels[offset+3]>=190 &&
       Math.abs(borderColor[0]-pixels[offset])<=4 && Math.abs(borderColor[1]-pixels[offset+1])<=4 &&
       Math.abs(borderColor[2]-pixels[offset+2])<=4) matches++;
    }
    best = Math.max(best, sum / (to-from));
    if (contiguous && matches >= (to-from)*.97) flatRows++;
    else contiguous=false;
   }
  return { black:best, strip:flatRows>=3 && flatRows>=depth*.028 };
  };
 const edges = [side(0,false), side(1,true), side(0,true), side(1,false)];
 const sides = edges.map(edge=>edge.black);
  const area = (x1-x0+1) * (y1-y0+1);
  const density = painted / area, nearBlack = dark / area, content = picture / area;
  const rounded = value => Math.round(value * 1000) / 1000;
  const cornerDepthX=Math.round((x1-x0+1)*.15), cornerDepthY=Math.round((y1-y0+1)*.15);
  let deepestCorner=0;
  if(cornerDepthX>=4 && cornerDepthY>=4 && nearBlack>.045){
   for(const startX of [x0,x1-cornerDepthX+1]) for(const startY of [y0,y1-cornerDepthY+1]){
    let hits=0;
    for(let y=startY;y<startY+cornerDepthY;y++)for(let x=startX;x<startX+cornerDepthX;x++)hits+=black[y*w+x];
    deepestCorner=Math.max(deepestCorner,hits/(cornerDepthX*cornerDepthY));
   }
  }
  let sceneEdge;
  // Report nearly rectangular backdrops with small missing edges for review.
  if (painted >= w * h * .27 && density < .997 && area > w * h * .35) {
   const mask = new Uint8Array(w * h);
   for (let i = 0; i < mask.length; i++) mask[i] = pixels[4 * i + 3] >= 232;
   const rect = largestOpaqueRectangle(mask, w, h);
   if (rect && rect.area >= painted * .83 && rect.area >= w * h * .24) {
    const insets = [rect.left - x0, rect.top - y0, x1 + 1 - rect.right, y1 + 1 - rect.bottom];
    if (insets.some(value => value >= 2)) sceneEdge = insets.map((v,i) => rounded(Math.max(0,v) / (i % 2 ? y1-y0+1 : x1-x0+1)));
   }
  }
  return {
   density:rounded(density), coverage:rounded(painted/(w*h)), dark:rounded(nearBlack), content:rounded(content), sides:sides.map(rounded),
   artwork, sceneEdge, wedge:nearBlack>.08 && deepestCorner>.90,
   solidStrip:density>.72 && content>.16 && edges.filter(edge=>edge.strip).length>=2,
   suspect:density > .72 && nearBlack > .21 && nearBlack < .99 && content > .015 &&
     sides.filter(x => x > .91).length >= 2,
  };
 };
}

function live2DRingProbe(live) {
 const internal = live.internalModel, native = internal.coreModel;
 const mesh = native.getModel().drawables;
 const atlases = new Map();
 function atlas(index) {
  if (atlases.has(index)) return atlases.get(index);
  const image = live.textures[index]?.baseTexture.resource?.source;
  let result = null;
  if (image) {
   const tile = document.createElement('canvas');
   tile.width = Math.min(640, image.width);
   tile.height = Math.min(640, image.height);
   try {
    const ctx = tile.getContext('2d', {willReadFrequently:true});
    ctx.drawImage(image, 0, 0, tile.width, tile.height);
    result = ctx.getImageData(0, 0, tile.width, tile.height);
   } catch { /* Texture pixels are unavailable for this asset. */ }
  }
  atlases.set(index,result);
  return result;
 }
 function textureStats(index) {
  const image = atlas(mesh.textureIndices[index]), uv = mesh.vertexUvs[index], tris = mesh.indices[index];
  if (!image || !tris.length) return null;
  let solid = 0, dark = 0, total = 0;
  const colors = new Set();
  for (let at = 0; at < tris.length; at += 3) {
   const [a,b,c] = tris.subarray(at,at+3);
   for (const [wa,wb,wc] of [[1/3,1/3,1/3],[.6,.2,.2],[.2,.6,.2],[.2,.2,.6]]) {
    const u = uv[a*2]*wa + uv[b*2]*wb + uv[c*2]*wc;
    const v = uv[a*2+1]*wa + uv[b*2+1]*wb + uv[c*2+1]*wc;
    const x = Math.max(0,Math.min(image.width-1,Math.floor(u*image.width)));
    const y = Math.max(0,Math.min(image.height-1,Math.floor((1-v)*image.height)));
    const p = (y*image.width+x)*4;
    total++;
    if (image.data[p+3]<36) continue;
    solid++;
    if (Math.max(image.data[p],image.data[p+1],image.data[p+2]) <= 12) dark++;
    if (image.data[p+3]>=232 && colors.size<12) {
     colors.add((image.data[p]>>4)*256+(image.data[p+1]>>4)*16+(image.data[p+2]>>4));
    }
   }
  }
  return { solid:solid/total, dark:solid ? dark/solid : 0, colors:colors.size };
 }
 const darkDrawables = [], dividedDrawables = [], backdropDrawables = [];
 for (let i = 0; i < mesh.ids.length; i++) {
  const count=mesh.vertexCounts[i];
  if (count<4 || count>28 || mesh.maskCounts[i]) continue;
  const stats=textureStats(i);
  if (!stats) continue;
  if (stats.solid>=.45 && stats.dark>=.97) {
   if (count>=8 && count<=16) darkDrawables.push(i);
   if (count===6) dividedDrawables.push(i);
  }
  if (stats.solid>=.88 && stats.dark<.45 && stats.colors>=12) backdropDrawables.push(i);
 }
 const length = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
 const cross = (a,b,c) => (b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);
 function hull(points) {
  const sorted = points.slice().sort((a,b) => a.x-b.x || a.y-b.y);
  const chain = items => {
   const result = [];
   for (const point of items) {
    while (result.length > 1 && cross(result.at(-2),result.at(-1),point) <= 0) result.pop();
    result.push(point);
   }
   return result.slice(0,-1);
  };
  return [...chain(sorted),...chain(sorted.reverse())];
 }
 function pointsFor(index) {
  const vertices = internal.getDrawableVertices(index);
  if (!vertices?.length) return [];
  return Array.from({length:vertices.length/2}, (_,i) => {
   const xy = internal.localTransform.apply(new PIXI.Point(vertices[i*2],vertices[i*2+1]));
   return {i, drawable:mesh.ids[index], x:xy.x, y:xy.y};
  });
 }
 function ring(points) {
  const outside = hull(points);
  if (outside.length !== 4) return null;
  const perimeter = new Set(outside);
  const inside = points.filter(p => !perimeter.has(p));
  const outerArea = Math.abs(cross(outside[0],outside[1],outside[2])) / 2 +
   Math.abs(cross(outside[2],outside[3],outside[0])) / 2;
  const minArea = internal.width * internal.height * .10;
  if (outerArea < minArea * 4) return null;
  let best = null;
  for (let a=0; a<inside.length-3; a++) for (let b=a+1; b<inside.length-2; b++) {
   for (let c=b+1; c<inside.length-1; c++) for (let d=c+1; d<inside.length; d++) {
    const p = hull([inside[a],inside[b],inside[c],inside[d]]);
    if(p.length!==4)continue;
    const lengths = p.map((point,i) => length(point,p[(i+1)%4]));
    const area = Math.abs(cross(p[0],p[1],p[2])) / 2 + Math.abs(cross(p[2],p[3],p[0])) / 2;
    if (area<minArea || area>outerArea*.64 || area>(best?.area ?? Infinity)) continue;
    if (Math.max(...lengths)/Math.min(...lengths)>3.2 || Math.abs(lengths[0]-lengths[2])>lengths[0]*.12 ||
      Math.abs(lengths[1]-lengths[3])>lengths[1]*.12) continue;
    const cosine = (lengths[0]**2 + lengths[1]**2 - length(p[0],p[2])**2) / (2*lengths[0]*lengths[1]);
    if (Math.abs(cosine) > .22) continue;
    // Camera windows are stored clockwise, starting on the upper left.
    const tl = p.reduce((best,pt,i) => pt.x+pt.y < p[best].x+p[best].y ? i : best,0);
    const corners = [0,3,2,1].map(n => p[(tl+n)%4]);
    const horizontal = corners[3].x-corners[0].x, vertical = corners[3].y-corners[0].y;
    if (horizontal <= 0 || Math.abs(vertical) > horizontal * .76) continue;
    const drawable=corners[0].drawable;
    const spec=corners.every(corner=>corner.drawable===drawable)
     ? {drawable,corners:corners.map(corner=>corner.i),vertexCount:points.length}
     : {points:corners.map(corner=>[corner.drawable,corner.i])};
    best = { spec, area };
   }
  }
  return best;
 }
 const discover = (minOpacity = .96) => {
  const visible = index => mesh.opacities[index]>minOpacity && native.getDrawableDynamicFlagIsVisible(index);
  const candidates=darkDrawables.filter(visible).map(index=>ring(pointsFor(index))).filter(Boolean);
  const halves=dividedDrawables.filter(visible);
  const threshold=Math.min(internal.width,internal.height)*.001;
  for(let a=0;a<halves.length-1;a++) for(let b=a+1;b<halves.length;b++){
   if(Math.abs(mesh.renderOrders[halves[a]]-mesh.renderOrders[halves[b]])>2)continue;
   const left=pointsFor(halves[a]), right=pointsFor(halves[b]);
   const unique=right.filter(point=>left.every(other=>length(point,other)>threshold));
   if(left.length!==6 || unique.length!==2)continue;
   const candidate=ring([...left,...unique]);
   if(candidate?.spec.points)candidates.push(candidate);
  }
  return candidates.sort((a,b)=>a.area-b.area).slice(0,4).map(candidate=>candidate.spec);
 };
 discover.backdrops=()=>{
  const candidates=[];
  for (const index of backdropDrawables) {
   if (mesh.opacities[index]<.97 || !native.getDrawableDynamicFlagIsVisible(index)) continue;
   const vertices=pointsFor(index), rim=hull(vertices);
   if (rim.length!==4) continue;
   const tl=rim.reduce((best,point,i)=>point.x+point.y<rim[best].x+rim[best].y ? i : best,0);
   const [p,q,r,s]=[0,3,2,1].map(offset=>rim[(tl+offset)%4]);
   const widths=[length(p,s),length(q,r)], heights=[length(p,q),length(s,r)];
   const width=(widths[0]+widths[1])/2, height=(heights[0]+heights[1])/2;
   if (width*height < internal.width*internal.height*.26 || width/height<.56 || width/height>2.8 ||
       Math.abs(widths[0]-widths[1])>width*.07 || Math.abs(heights[0]-heights[1])>height*.07 ||
       Math.abs(s.y-p.y)>(s.x-p.x)*.42) continue;
   const corner=(widths[0]**2+heights[0]**2-length(q,s)**2)/(2*widths[0]*heights[0]);
   if (Math.abs(corner)>.11) continue;
   candidates.push({ area:width*height, spec:{drawable:mesh.ids[index],corners:[p.i,q.i,r.i,s.i],
    vertexCount:vertices.length,reviewed:true,inset:[.007,.007,.007,.007]} });
  }
  return candidates.sort((a,b)=>b.area-a.area).slice(0,5).map(item=>item.spec);
 };
 return discover;
}

// Compare the authored opening to the camera that was actually displayed at
// a pose. A fading screen matte can darken the scene without producing any
// black pixels, so RGB strip detection alone won't find this defect.
function inspectCameraMatte(drawables, camera, opening, displayed) {
 const ids = camera.drawable ? [camera.drawable] : [...new Set((camera.edges ?? camera.points)?.map(([id])=>id) ?? [])];
 if (!ids.length || !opening) return null;
 const opacity = Math.min(...ids.map(id => drawables.opacities[drawables.ids.indexOf(id)] ?? 0));
 if (opacity <= .08) return null;
 const area = frame => (frame.maxX-frame.minX)*(frame.maxY-frame.minY);
 const exposed = !displayed || area(displayed) > area(opening)*1.09;
 return {opacity, exposed};
}

// Compare the same painted pixels through the old and new camera transforms.
// A brighter enlarged crop can still lose part of the artwork at its edges.
function projectArtwork(before, after, visit) {
 const art=before.artwork;
 if(!art || !after.artwork || !art.positions.length)return 0;
 const a=art.transform, b=after.artwork.transform;
 const bracket=a.a*a.d-a.b*a.c;
 if(!Number.isFinite(bracket)||Math.abs(bracket)<1e-12)return 0;
 for(let i=0;i<art.positions.length;i+=2){
  const x=art.positions[i]-a.tx, y=art.positions[i+1]-a.ty;
  const u=(a.d*x-a.c*y)/bracket, v=(a.a*y-a.b*x)/bracket;
  visit(b.a*u+b.c*v+b.tx, b.b*u+b.d*v+b.ty);
 }
 return art.positions.length/2;
}

function artworkRetention(before,after) {
 if(!before.artwork?.positions.length)return 1;
 if(!after.artwork)return 0;
 const [left,top,right,bottom]=after.artwork.bounds;
 const samplingAllowance=Math.max(right-left,bottom-top)*.009;
 let inside=0;
 const total=projectArtwork(before,after,(x,y)=>{
  if(x>=left-samplingAllowance && x<=right+samplingAllowance &&
   y>=top-samplingAllowance && y<=bottom+samplingAllowance)inside++;
 });
 return total ? inside/total : 0;
}

// Retain the same aspect ratio. A larger opening is a candidate only and must
// still pass the visual checks, including the corners, on every sampled pose.
function artworkOutset(before, after) {
 if(!after.artwork)return 0;
 const [left,top,right,bottom]=after.artwork.bounds;
 const width=right-left, height=bottom-top;
 if(!(width>0 && height>0))return 0;
 let margin=0;
 projectArtwork(before,after,(x,y)=>{
  margin=Math.max(margin,(left-x)/width,(x-right)/width,(top-y)/height,(y-bottom)/height);
 });
 return Math.ceil(margin*100)/100;
}

function confirmedFrame(before, after) {
 if (after.empty || after.density < .83) return false;
 if (before.empty || before.content < .015) return true; // An authored blackout may remain dark.
 return artworkRetention(before,after)>=.96 &&
  after.content >= Math.max(.35,before.content*.97) && after.dark <= before.dark+.035;
}

function improvedFrame(before, after) {
 if (after.empty || after.wedge || !confirmedFrame(before,after)) return false;
 if (before.sceneEdge && !after.sceneEdge && after.coverage>=.985 &&
     after.dark<=before.dark+.015 && artworkRetention(before,after)>=.975) return true;
 if (before.wedge && !after.suspect && before.dark-after.dark >= .07 && after.content-before.content >= .05) return true;
 return before.suspect && before.dark-after.dark >= .17 && after.content-before.content >= .13 &&
  after.sides.filter(x=>x>.91).length < before.sides.filter(x=>x>.91).length;
}

function sameFraming(before, after) {
 if(before.empty && after.empty)return true;
 if(!before.artwork || !after.artwork)return false;
 const {transform:a,bounds:aBounds}=before.artwork, {transform:b,bounds:bBounds}=after.artwork;
 return aBounds.every((value,index)=>Math.abs(value-bBounds[index])<.1) &&
  Object.keys(a).every(key=>Math.abs(a[key]-b[key])<.001);
}

function apertureSwitchIsSmooth(before, after) {
 if (before.empty || after.empty || before.content < .07 || after.content < .07) return true;
 const a = before.artwork?.transform, b = after.artwork?.transform;
 if (!a || !b) return false;
 const scale = Math.hypot(b.a,b.b)/Math.hypot(a.a,a.b);
 const rotation = Math.atan2(a.a*b.b-a.b*b.a, a.a*b.a+a.b*b.b);
 const [left,top,right,bottom] = before.artwork.bounds;
 let displacement = 0;
 projectArtwork(before,after,(x,y)=>{ // Compare the camera at the same pose, not the character motion.
  displacement = Math.max(displacement, Math.max(left-x,x-right,top-y,y-bottom));
 });
 const centerX = (left+right)/2-a.tx, centerY=(top+bottom)/2-a.ty;
 const nextX=b.tx+scale*(centerX*Math.cos(rotation)-centerY*Math.sin(rotation));
 const nextY=b.ty+scale*(centerY*Math.cos(rotation)+centerX*Math.sin(rotation));
 const reach = Math.min(right-left,bottom-top);
 return Number.isFinite(scale) && Math.abs(Math.log(scale))<.10 && Math.abs(rotation)<.045 &&
  Math.hypot(nextX-(left+right)/2,nextY-(top+bottom)/2)<reach*.08 && displacement<reach*.05;
}

async function verifyApertureExports({api, duration, read, seek, encode, reference, times, transform}) {
 const K=window.SpineKit, signal=AbortSignal.timeout(20000);
 const pngQuality=K.pngRequest('medium','custom',320), quality='medium';
 const accept=(source,before)=>{
  const after=read(source,false,transform());
  if(!before.empty && before.content>=.07 &&
     (after.empty || after.suspect || after.wedge && after.dark>.15 || artworkRetention(before,after)<.96)) {
   throw Error('导出画幅出现多余边框或丢失主体画面');
  }
 };
 const middle=Math.floor(times.length/2);
 window.__frameAuditEncoding=true;
 try {
  seek(times[middle]);
  const png=api.capture(api.timeline(),'png',pngQuality);
  try {
   const size=K.illustrationExportSize(png,pngQuality);
   accept(png.draw(null,{...size,tiled:false},null),reference[middle]);
   if(encode){
    const {blob}=await K.encodePNGFrame({size,request:pngQuality,signal,background:null,
     drawTile:(tile,frame)=>png.draw(null,K.pngTileSize(frame,tile,png.pixelYUp!==false),null)});
    const frame=await createImageBitmap(blob);
    try {if(frame.width!==size.width || frame.height!==size.height || read(frame).empty)throw Error('导出的 PNG 解码失败');}
    finally {frame.close();}
   }
  } finally {png.dispose();}
  if(!duration)return;
  seek(0);
  const video=api.capture(api.timeline(),'video',quality);
  try {
   const base=await K.animationExportSize({session:video,duration,quality,kind:'video',signal});
   const factor=Math.min(1,320/Math.max(base.width,base.height));
   const size={...base,tiled:false,width:Math.max(2,Math.round(base.width*factor/2)*2),
    height:Math.max(2,Math.round(base.height*factor/2)*2),scale:base.scale*factor};
   times.forEach((time,index)=>accept(video.draw(time,size,null),reference[index]));
   if(!encode)return;
   video.rewind();
   const output=document.createElement('canvas');
   output.width=size.width;
   output.height=size.height;
   const ctx=output.getContext('2d',{alpha:false});
   // Encode a short sample using real frames spaced across the selected clip.
   const sampleDuration=.3;
   const {blob}=await K.encodeCanvasVideo({canvas:output,duration:sampleDuration,quality,signal,
    draw:time=>{ctx.fillRect(0,0,size.width,size.height);ctx.drawImage(video.draw(time/sampleDuration*duration,size,null),0,0);}});
   const player=document.createElement('video'), url=URL.createObjectURL(blob);
   player.preload='auto';
   try {
    await K.awaitExportTask(new Promise((resolve,reject)=>{
     player.addEventListener('loadeddata',resolve,{once:true});
     player.addEventListener('error',()=>reject(Error('导出视频解码失败')),{once:true});
     player.src=url;
    }),signal);
    if(player.videoWidth!==size.width || player.videoHeight!==size.height ||
       !Number.isFinite(player.duration) || Math.abs(player.duration-sampleDuration)>.08) throw Error('导出视频的尺寸或时长异常');
   } finally {
    player.removeAttribute('src');
    player.load();
    URL.revokeObjectURL(url);
   }
  } finally {video.dispose();}
 } finally {delete window.__frameAuditEncoding;}
}

module.exports = {largestOpaqueRectangle,makeFrameProbe,live2DRingProbe,inspectCameraMatte,projectArtwork,artworkRetention,artworkOutset,confirmedFrame,improvedFrame,
 sameFraming,apertureSwitchIsSmooth,verifyApertureExports};
