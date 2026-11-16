const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const text=fs.readFileSync(require('node:path').join(__dirname,'../common/interaction-viewer-tools.js'),'utf8');
const body=text.slice(text.indexOf('  window.createInteractionSpineCapture ='),text.indexOf('  // Install the same toolbar'));
const data={findAnimation:name=>name==='idle'?{name,duration:1}:null};
const slot=i=>({data:{index:i},attachment:'initial'+i,color:{r:1,g:1,b:1,a:1},deform:[],sequenceIndex:0,setAttachment(a){this.attachment=a}});
class Skeleton{
 constructor(data){this.data=data;this.bones=[{x:0,y:0,rotation:0,scaleX:1,scaleY:1,data:{name:'root'}}];this.slots=[slot(0),slot(1)];this.drawOrder=this.slots.slice();this.color={a:1};}
 updateWorldTransform(){}
}
const entries=[];
class State{
 constructor(){this.tracks=[]}
 clearTracks(){this.tracks=[]}
 setAnimation(index,name,loop){const e={trackIndex:index,animation:{name},loop,trackTime:0,resetRotationDirections(){}};entries.push(e);return this.tracks[index]=e}
 apply(sk){if(this.tracks[0]?.trackTime>.5){sk.slots[0].setAttachment('late');sk.slots[0].color.a=.2;sk.slots[0].deform=[4];sk.slots[0].sequenceIndex=3;sk.drawOrder.reverse()}}
}
const window={},K={measureBounds:()=>({minX:0,minY:0,maxX:10,maxY:10}),exportDimensions:f=>({...f,width:f.maxX-f.minX,height:f.maxY-f.minY}),parseColor:()=>[0,0,0]};
vm.runInNewContext(body,{window,K,poseOf:b=>({x:b.x,y:b.y,rotation:b.rotation,scaleX:b.scaleX,scaleY:b.scaleY}),worldUpdate:s=>s.updateWorldTransform()});
const original=new Skeleton(data),state=new State();state.setAnimation(0,'idle',true);
let rendered;
const camera={viewportWidth:10,viewportHeight:10,zoom:1,position:{x:0,y:0,z:0,set(x,y,z){Object.assign(this,{x,y,z})}},setViewport(){},update(){}};
const session=window.createInteractionSpineCapture({layers:[{skeleton:original,state}],ns:{Skeleton,AnimationState:State,AnimationStateData:class{}},canvas:{width:10,height:10},renderer:{camera,begin(){},end(){},drawSkeleton(s){rendered=JSON.stringify({slots:s.slots,order:s.drawOrder.map(s=>s.data.index)})}},gl:{viewport(){},clearColor(){},clear(){}},animation:{name:'idle',loop:true},restore(){}});
const size={width:10,height:10,fullFrame:true,tiled:false,scale:1,centerX:0,centerY:0};
session.draw(0,size,null);const first=rendered;
session.draw(.8,size,null);assert.notEqual(rendered,first);
session.rewind();session.draw(0,size,null);assert.equal(rendered,first,'measurement seeks must not contaminate the first frame');
assert(entries.at(-1).loop,'independent looping layers must retain looping playback');
session.fixedFrame={minX:0,minY:0,maxX:20,maxY:15};assert.equal(session.pngSize('medium').width,20,'PNG size preview must use the active crop');
assert.equal(original.slots[0].attachment,'initial0','live preview remains unchanged');
session.dispose();
console.log('Spine capture rewind, slot isolation, loop and crop checks passed');
