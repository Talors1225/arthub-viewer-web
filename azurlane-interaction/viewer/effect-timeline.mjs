// The effect queue has its own clock; seeking it must not seek the character.
export class EffectTimeline {
 constructor(manager,motion){
  this.manager=manager;this.duration=Number(motion.getLoopDuration());
  if(!Number.isFinite(this.duration)||this.duration<=0)throw Error('特效时长不可用');
  this.fps=Number.isFinite(motion._sourceFrameRate)&&motion._sourceFrameRate>0?motion._sourceFrameRate:30;
  this.parameterIds=Object.freeze([...new Set((motion._motionData?.curves||[]).filter(curve=>curve.type===1).map(curve=>curve.id))]);
  motion.setIsLoop(true);this.entry=manager.startMotion(motion,false,0);
  this.fade=Math.max(0,motion.getFadeInTime(),...(motion._motionData?.curves||[]).map(c=>c.fadeInTime||0))+1;
  this.time=0;this.fixed=false;this.settled=false;
 }
 state(){return {time:this.time,duration:this.duration,fps:this.fps,fixed:this.fixed};}
 snapshot(){return {...this.state(),settled:this.settled};}
 restore(state){this.time=state.time;this.fixed=state.fixed;this.settled=state.settled;}
 advance(seconds){
  if(this.fixed||!Number.isFinite(seconds)||seconds<=0)return;
  const next=this.time+seconds;this.settled||=next>=this.duration;this.time=next%this.duration;
 }
 seek(seconds){
  if(!Number.isFinite(seconds))return;
  this.time=Math.max(0,Math.min(this.duration-.000001,seconds));this.fixed=true;this.settled=true;
 }
 setFixed(fixed){this.fixed=!!fixed;this.settled=true;}
 restart(){this.time=0;this.fixed=false;this.settled=true;}
 sample(model){
  // Cubism moves an entry's start time at loop boundaries. Rebase the entry
  // before sampling so backward seeks and a frozen frame remain repeatable.
  const item=this.entry,time=this.time;
  item.setIsAvailable(true);item.setIsFinished(false);item.setIsStarted(true);
  item.setStartTime(0);item.setEndTime(-1);
  item.setFadeInStartTime(this.settled?time-this.fade:0);
  // Seeking a visual layer must not replay historical sound/user events.
  item.setLastCheckEventSeconds(time);
  this.manager.doUpdateMotion(model,time);
 }
}
