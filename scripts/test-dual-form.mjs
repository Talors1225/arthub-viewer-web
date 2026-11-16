import assert from 'node:assert/strict';
import {dualForms,linkedForm} from '../azurlane-interaction/viewer/dual-form.mjs';
import {Live2DController,SpineController} from '../azurlane-interaction/viewer/controller.mjs';

const catalog=dualForms.flat().map(id=>({id}));
assert.equal(new Set(catalog.map(x=>x.id)).size,catalog.length);
for(const [a,b] of dualForms){
 assert.equal(linkedForm(a,catalog).target,b);
 assert.equal(linkedForm(b,catalog).target,a);
 assert.equal(linkedForm(a,[{id:a}]),null);
}
assert.equal(linkedForm('jinluhao_2',catalog),null);
assert.equal(linkedForm('jinluhao_3_hx',catalog),null);
for(const C of [Live2DController,SpineController]){
 const plays=[];
 const c=new C({id:'test',defaultAnimation:'idle',animations:['idle','change_out'],motionDurations:{idle:10,change_out:1},interaction:{configs:[]}}, {play:name=>plays.push(name)});
 let finished=0;
 c.action('change_out',{force:true,manual:true,onComplete:()=>finished++});
 if(C===Live2DController){c.tick(1.01);c.tick(.1);}else{c.finish();c.finish();}
 assert.equal(finished,1,'handoff fires once');
 assert.deepEqual(plays,['change_out'],'handoff must not flash the outgoing idle');
 c.action('change_out',{force:true});
 if(C===Live2DController)c.tick(1.01);else c.finish();
 assert.equal(plays.at(-1),'idle','ordinary animations retain automatic idle return');
}
console.log('dual form links and transition completion passed');
