const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const text=fs.readFileSync(require('node:path').join(__dirname,'../common/interaction-viewer-tools.js'),'utf8');
const body=text.slice(text.indexOf('  K.spineArtworkAperture ='),text.indexOf('  // Install the same toolbar'));
const data={findAnimation:name=>['idle','opening','matte'].includes(name)?{name,duration:1}:null};
const slot=i=>({data:{index:i,name:'slot'+i},bone:{active:true},attachment:'initial'+i,color:{r:1,g:1,b:1,a:1},deform:[],sequenceIndex:0,setAttachment(a){this.attachment=a}});
class MeshAttachment {
 worldVerticesLength=8;
 computeWorldVertices(slot,start,count,vertices){vertices.set([4,26,4,6,24,6,24,26]);}
}
class Skeleton{
 constructor(data){this.data=data;this.color={a:1};this.setToSetupPose();}
 setToSetupPose(){this.bones=[{x:0,y:0,rotation:0,scaleX:1,scaleY:1,data:{name:'root'}}];this.slots=[slot(0),slot(1)];this.drawOrder=this.slots.slice();}
 findSlot(name){return this.slots.find(slot=>slot.data.name===name);}
 updateWorldTransform(){}
}
const entries=[];
class State{
 constructor(){this.tracks=[]}
 clearTracks(){this.tracks=[]}
 setAnimation(index,name,loop){const e={trackIndex:index,animation:{name},loop,trackTime:0,resetRotationDirections(){}};entries.push(e);return this.tracks[index]=e}
 apply(sk){
  if(this.tracks[0]?.animation.name==='opening')sk.slots[1].setAttachment('start-scene');
  if(this.tracks[0]?.trackTime>.5){sk.slots[0].setAttachment(this.tracks[0].animation.name==='matte'?new MeshAttachment():'late');sk.slots[0].color.a=.2;sk.slots[0].deform=[4];sk.slots[0].sequenceIndex=3;sk.drawOrder.reverse();}
 }
}
const window={},K={measureBounds:s=>({minX:0,minY:0,maxX:s.slots[1].attachment==='start-scene'?24:10,maxY:10}),exportDimensions:f=>({...f,width:f.maxX-f.minX,height:f.maxY-f.minY}),parseColor:()=>[0,0,0]};
vm.runInNewContext(body,{window,K,poseOf:b=>({x:b.x,y:b.y,rotation:b.rotation,scaleX:b.scaleX,scaleY:b.scaleY}),worldUpdate:s=>s.updateWorldTransform()});
const original=new Skeleton(data),state=new State();state.setAnimation(0,'idle',true);
let rendered;
const camera={viewportWidth:10,viewportHeight:10,zoom:1,position:{x:0,y:0,z:0,set(x,y,z){Object.assign(this,{x,y,z})}},setViewport(){},update(){}};
const options={layers:[{skeleton:original,state}],ns:{Skeleton,MeshAttachment,AnimationState:State,AnimationStateData:class{}},canvas:{width:10,height:10},renderer:{camera,begin(){},end(){},drawSkeleton(s){rendered=JSON.stringify({slots:s.slots,order:s.drawOrder.map(s=>s.data.index),rotation:s.bones[0].rotation})}},gl:{viewport(){},clearColor(){},clear(){}},animation:{name:'idle',loop:true},restore(){}};
const session=window.createInteractionSpineCapture(options);
const size={width:10,height:10,fullFrame:true,tiled:false,scale:1,centerX:0,centerY:0};
session.draw(0,size,null);const first=rendered;
session.draw(.8,size,null);assert.notEqual(rendered,first);
session.rewind();session.draw(0,size,null);assert.equal(rendered,first,'measurement seeks must not contaminate the first frame');
assert(entries.at(-1).loop,'independent looping layers must retain looping playback');
session.fixedFrame={minX:0,minY:0,maxX:20,maxY:15};assert.equal(session.pngSize('medium').width,20,'PNG size preview must use the active crop');
assert.equal(original.slots[0].attachment,'initial0','live preview remains unchanged');
session.dispose();
original.slots[1].setAttachment('outgoing-cover');
const fromSetup = window.createInteractionSpineCapture({...options, fromSetupPose:true});
fromSetup.draw(0,size,null);
assert.equal(rendered,first,'export does not inherit an outgoing shot’s unkeyed cover');
assert.equal(original.slots[1].attachment,'outgoing-cover','export leaves the live transition intact');
fromSetup.dispose();
const opening=window.createInteractionSpineCapture({...options,animation:{name:'opening',loop:true},fromSetupPose:true,setupRotation:()=>-15});
assert.equal(opening.pngSize('medium').width,24,'framing samples the selected opening pose');
opening.draw(null,size,null);
assert.equal(JSON.parse(rendered).slots[1].attachment,'start-scene','the framing probe draws the selected opening pose');
assert.equal(JSON.parse(rendered).rotation,-15,'a configured scene rotation survives the setup pose reset');
opening.dispose();
const following=window.createInteractionSpineCapture({...options,animation:{name:'matte',loop:true},
 artworkAperture:{slot:'slot0',corners:[0,1,2,3],hideMatte:true}});
following.draw(.8,size,null);
assert.ok(Math.abs(camera.zoom-1.952)<1e-8,'fit the output inside both sides of the current opening');
assert.equal(camera.position.x,14);
assert.equal(camera.position.y,16);
assert.equal(JSON.parse(rendered).slots[0].color.a,0,'trim the matte after using its geometry to fit the picture');
following.draw(0,size,null);
assert.equal(camera.position.x,0,'a shot without an opening uses the original frame');
following.dispose();
const framingSource=fs.readFileSync(require('node:path').join(__dirname,'../crosscore/viewer/scene-framing.js'),'utf8');
vm.runInNewContext(framingSource,{window});
const verifyMatte=(skel,name,region,motion,expected)=>{
 const current={color:{a:.9},attachment:{region:{name:region}}};
 const layer={source:{skel},pma:true,skeleton:{findSlot:key=>key===name?current:undefined}};
 const renderer={drawSkeleton(){assert.equal(current.color.a,expected);}};
 window.CrossCoreSceneFraming.drawLayer(renderer,layer,motion);
 assert.equal(current.color.a,.9,'rendering does not change the animation slot');
};
verifyMatte('20110_skin_Arpeggio07.json','box2','box2','idle1',0);
verifyMatte('20110_skin_Arpeggio07.json','box2','different-texture','idle1',.9);
verifyMatte('78050_skin_Osiris03a.json','TX_BG_black10','TX_BG_black10','in',.9);
verifyMatte('10070_skin_Cinnabar03c.json','heiping','heiping','click11_2',.9);
console.log('Spine capture rewind, slot isolation, loop and crop checks passed');
