import assert from 'node:assert/strict';
import {Live2DController} from '../azurlane-interaction/viewer/controller.mjs';
const played=[];
const model={id:'manual-preview',defaultAnimation:'idle',animations:['idle','idle16','touch'],motionDurations:{idle:4,idle16:12,touch:1},interaction:{configs:[
 {id:1,parameter:'Arm',start_value:1,range:[0,1],mode:1,draw_able_name:'Touch',action_trigger:{type:10,trigger_name:'idle16',trigger_index:0,trigger_rate:0,action:'touch'}}
]}};
const c=new Live2DController(model,{play:name=>played.push(name)});
c.playIdle();assert.equal(c.parameters()[0].value,1);
c.action('idle16',{force:true,idle:true,manual:true});
assert.deepEqual(c.parameters(),[],'raw clip must not inherit idle interaction poses');
c.tick(.5);assert.equal(c.state.motion,'idle16','interaction triggers must not interrupt manual preview');
c.playIdle();assert.equal(c.parameters()[0].value,1,'interactive idle restores its own parameters');
assert.equal(c.state.motion,'idle');
console.log('Manual preview isolation and return-to-interaction passed');
