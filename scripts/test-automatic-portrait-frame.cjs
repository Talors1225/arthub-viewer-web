'use strict';

const assert = require('node:assert/strict');
const {largestOpaqueRectangle, makeFrameProbe, live2DRingProbe, inspectCameraMatte, artworkRetention, artworkOutset, confirmedFrame, improvedFrame,
 sameFraming, apertureSwitchIsSmooth} = require('./portrait-frame-probe.cjs');

function pixels(width, height, color) {
 const data = new Uint8ClampedArray(width*height*4);
 for (let y=0; y<height; y++) for (let x=0; x<width; x++) data.set(color(x,y), (y*width+x)*4);
 return {width,height,data,style:{},clientWidth:width,clientHeight:height};
}
global.document={createElement:()=>{
 let source;
 return {getContext:()=>({drawImage(image){source=image;},getImageData(){return source;}})};
}};
global.PIXI={Point:class { constructor(x,y){this.x=x;this.y=y;} }};

const black=[0,0,0,255];
const art=(x,y)=>[42+(x%11),80+(y%16),95+(x%22),255];
const picture=makeFrameProbe();
const framed=picture(pixels(80,50,(x,y)=>x<18||x>61||y<8||y>41?black:art(x,y)));
const exposed=picture(pixels(44,34,art));
assert.ok(framed.suspect && framed.solidStrip);
assert.ok(improvedFrame(framed,exposed));
assert.equal(improvedFrame(framed,framed),false);
assert.equal(confirmedFrame(exposed,framed),false,'a new opaque matte cannot be applied over the picture');
const darkScene=picture(pixels(80,50,(x,y)=>[13+(x%15),16+(y%9),21+(x%6),255]));
assert.equal(darkScene.suspect,false,'dark colors inside the scene do not count as a solid border');
const pale=picture(pixels(80,50,(x,y)=>x<10||x>69?[222,227,232,255]:art(x,y)));
assert.equal(pale.solidStrip,true);
assert.equal(pale.suspect,false,'a flat colored edge alone cannot authorize an automatic matte repair');
const clear=[0,0,0,0];
const stepped=picture(pixels(80,50,(x,y)=>x<3 && y<25 || x>=77 && y>=25 ? clear : art(x,y)));
assert.deepEqual(stepped.sceneEdge,[.038,0,.038,0],'detect scene layers that leave transparent steps at the frame edges');
const outlier=picture(pixels(80,50,(x,y)=>x>=14 && y>=8 || x>=8 && x<19 && y>=2 && y<22 ? art(x,y) : clear));
assert.ok(outlier.sceneEdge?.[0] > .06 && outlier.sceneEdge?.[1] > .06,'detect a pillar extending outside the scene backdrop');
const silhouette=picture(pixels(80,50,(x,y)=>Math.hypot(x-40,y-25)<24 ? art(x,y) : clear));
assert.equal(silhouette.sceneEdge,undefined,'a transparent cutout is not a rectangular camera view');
const opening={minX:0,minY:0,maxX:160,maxY:90};
const drawing={ids:['scene-window'],opacities:[.56]};
assert.deepEqual(inspectCameraMatte(drawing,{drawable:'scene-window'},opening,
 {minX:-25,minY:-12,maxX:185,maxY:102}),{opacity:.56,exposed:true});
assert.deepEqual(inspectCameraMatte(drawing,{drawable:'scene-window'},opening,opening),
 {opacity:.56,exposed:false});
assert.equal(inspectCameraMatte({ids:['scene-window'],opacities:[0]},{drawable:'scene-window'},opening,null),null);
assert.deepEqual(inspectCameraMatte(
 {ids:['top','left','bottom','right'],opacities:[.76,.64,.7,.72]},
 {edges:[['top',0,1],['left',1,2],['bottom',0,3],['right',1,3]]},opening,null),
 {opacity:.64,exposed:true});
assert.equal(largestOpaqueRectangle(new Uint8Array(9),3,3),null);
assert.deepEqual(largestOpaqueRectangle(Uint8Array.of(1,1,0,0,1,1,1,1,1),3,3),
 {left:1,top:1,right:3,bottom:3,area:4});

const camera = {a:1,b:0,c:0,d:1,tx:0,ty:0};
const full = {...exposed,artwork:{transform:camera,positions:[10,10,20,20,40,30,50,40],bounds:[0,0,60,50]}};
const zoomed = {...exposed,artwork:{transform:{...camera,a:2,d:2,tx:-10,ty:-10},bounds:[0,0,105,88]}};
assert.equal(artworkRetention(full,zoomed),1,'zoom may enlarge the same art');
const clipped = {...zoomed,artwork:{...zoomed.artwork,bounds:[0,0,66,88]}};
assert.equal(artworkRetention(full,clipped),.5);
assert.equal(confirmedFrame(full,clipped),false,'improving brightness cannot justify cutting painted content');
assert.equal(artworkOutset(full,zoomed),0,'avoid extra padding when the canvas already contains the art');
assert.equal(artworkOutset(full,clipped),.37,'measure the proportional padding needed to retain the right edge');
assert.equal(sameFraming(full,full),true);
assert.equal(sameFraming(zoomed,clipped),false);
assert.equal(apertureSwitchIsSmooth(full,zoomed),false,'a visible jump must not turn on a new crop');
assert.equal(apertureSwitchIsSmooth(full,{empty:true}),true,'an authored blackout can conceal a frame change');
assert.equal(improvedFrame({...full,sceneEdge:[0,.025,0,0]},zoomed),true,
 'accept an opaque, bounds-preserving crop of a rectangular backdrop');
assert.equal(improvedFrame({...full,sceneEdge:[0,.025,0,0]},clipped),false,
 'reject a rectangular camera that drops illustration pixels');

function textureProbe(items, color=black) {
 const drawables={
  ids:items.map(item=>item[0]), vertexCounts:items.map(item=>item[1].length/2),
  opacities:items.map(()=>1), renderOrders:items.map((_,i)=>i+50), maskCounts:items.map(()=>0),
  textureIndices:items.map(()=>0), vertexUvs:items.map(item=>new Float32Array(item[1].length).fill(.5)),
  indices:items.map(()=>new Uint16Array([0,1,2,2,3,0])),
 };
 const image=pixels(64,64,()=>color);
 const live={
  textures:[{baseTexture:{resource:{source:image}}}],
  internalModel:{
   width:100,height:60,coreModel:{getModel:()=>({drawables}),getDrawableDynamicFlagIsVisible:()=>true},
   localTransform:{apply:p=>p},getDrawableVertices:index=>items[index][1],
  },
 };
 return live2DRingProbe(live)();
}
const single=['mask', [300,-200,-200,-200,300,260,-200,260,1,1,1,59,99,59,99,1]];
assert.deepEqual(textureProbe([single]),[{drawable:'mask',corners:[4,5,6,7],vertexCount:8}]);
assert.deepEqual(textureProbe([single],[12,45,76,255]),[],'keep a colored decorative frame');
assert.deepEqual(textureProbe([
 ['left',[300,-200,-200,-200,-200,260,1,1,1,59,99,1]],
 ['right',[300,-200,300,260,-200,260,1,59,99,59,99,1]],
]),[{points:[['left',3],['left',4],['right',4],['left',5]]}]);
console.log('Automatic matte detection and conservative preview validation passed');
