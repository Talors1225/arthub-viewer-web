import assert from 'node:assert/strict';
import { Live2DController } from '../azurlane-interaction/viewer/controller.mjs?v=20261114-interaction-export-loading';

// Target-click/release settings from the named catalog entries. These controls
// change persistent model parameters, so playing an animation alone is not a test.
const fixtures = [
 {model:'sebao_2',id:81801105,draw_able_name:'TouchDrag9',parameter:'Param312',revert:100,smooth:100,revert_smooth:100,limit_time:1,action_trigger:{circle:true,target:1,type:2}},
 {model:'feiteliedadi_3',id:49902202,draw_able_name:'TouchDrag2',parameter:'touch_drag2',revert:1,smooth:40,revert_smooth:10,limit_time:1,offset_y:-50,action_trigger:{target:1,type:2}},
 {model:'bailong_3',id:3990521,draw_able_name:'TouchDrag1',parameter:'touch_drag1',revert:400,smooth:10,revert_smooth:10,offset_x:99999,action_trigger:{target:1,type:2}},
];
const create=configs=>new Live2DController({id:'release-test',defaultAnimation:'idle',animations:['idle'],motionDurations:{idle:10},interaction:{configs:configs.map(config=>({range:[0,1],start_value:0,mode:1,...config}))}},{play(){}});
const advance=(c,seconds)=>{for(let i=0;i<Math.ceil(seconds*60);i++)c.tick(1/60);};
for(const fixture of fixtures){
 const c=create([fixture]),area=fixture.draw_able_name;
 c.start([area],0,0);assert.equal(c.end(0,0,false,[area],.1),true);
 const s=c.states[0];assert.equal(s.target,1,fixture.model+' sets clicked value');
 assert.equal(s.releaseAt,null,fixture.model+' click supersedes its release revert');
 advance(c,1.2);assert.equal(s.value,1,fixture.model+' keeps clicked value after the revert interval');
 if(fixture.action_trigger.circle){c.start([area],0,0);c.end(0,0,false,[area],.1);advance(c,.2);assert.equal(s.value,0,'toggle can be switched back off');}
}
{
 const c=create([
  {id:1,draw_able_name:'Button',parameter:'button',revert:-1,action_trigger:{type:2,target:1}},
  {id:2,draw_able_name:'Button',parameter:'dependent',revert:1,smooth:0,listener_data:{type:2,change:[[2,['Button'],1]]}},
 ]);
 c.start(['Button'],0,0);c.end(0,0,false,['Button'],.1);advance(c,.2);
 assert.equal(c.states[1].value,1,'another active control must not undo the click listener during its release cleanup');
}
for(const gesture of ['cancel','moved','outside','held']){
 const c=create([fixtures[0]]),area=fixtures[0].draw_able_name;c.start([area],0,0);
 if(gesture==='moved'){c.move(40,0);c.move(0,0);}
 c.end(0,0,gesture==='cancel',gesture==='outside'?[]:[area],gesture==='held'?.8:.1);advance(c,.5);
 assert.equal(c.states[0].value,0,gesture+' must not toggle the control');
}
{
 // Suweiaitongmeng_3's nine board controls still respect action cooldowns.
 const c=create(Array.from({length:9},(_,i)=>({id:i,draw_able_name:'Cell'+i,parameter:'cell'+i,revert:-1,action_trigger:{type:15,index:i+1}})));
 c.states[0].cooldown=1;c.start(['Cell0'],0,0);c.end(0,0,false,['Cell0'],.1);
 assert.equal(c.states[0].target,0,'moving clicks out of tick must not bypass its cooldown guard');
 advance(c,1.1);c.start(['Cell0'],0,0);c.end(0,0,false,['Cell0'],.1);
 assert.equal(c.states[0].target,1,'board becomes usable after the cooldown');
}
console.log('Persistent target clicks, release listeners and cancelled gestures passed');
