// Reviewed scene anchors. The original models and render order are unchanged.
// These two scenes contain oversized opaque surrounds outside their artwork.
const rules = {
 yunlong_3: { anchors:['yc2_bj'], surrounds:['kkkkk','kkkkk2','kkkkk3','kkkkk4'] },
 guanghui_9: { anchors:['ArtMesh292'], surrounds:['ArtMesh545','ArtMesh546','ArtMesh416','ArtMesh518','ArtMesh519','ArtMesh977','ArtMesh978','ArtMesh979','ArtMesh980'] },
};
export const portraitSurroundNames=id=>new Set(rules[id]?.surrounds||[]);
export function portraitFrameBounds(id, rectangles) {
 const rule=rules[id];if(!rule)return null;
 const valid=rectangles.filter(r=>r.visible!==false&&r.bounds?.length===4&&r.bounds.every(Number.isFinite)&&r.bounds[2]>r.bounds[0]&&r.bounds[3]>r.bounds[1]);
 const anchors=valid.filter(r=>rule.anchors.includes(r.name));
 const selected=anchors.length?anchors:valid.filter(r=>!rule.surrounds.includes(r.name));
 if(!selected.length)return null;
 return {minX:Math.min(...selected.map(r=>r.bounds[0])),minY:Math.min(...selected.map(r=>r.bounds[1])),maxX:Math.max(...selected.map(r=>r.bounds[2])),maxY:Math.max(...selected.map(r=>r.bounds[3]))};
}
export function spinePortraitFrameBounds(id,layers,ns,hidden=new Set()) {
 if(!rules[id])return null;
 const rectangles=[];
 layers.forEach((layer,index)=>{for(const slot of layer.skeleton.drawOrder){
  const a=slot.attachment;if(!a||!slot.bone.active||slot.color.a<=.001||a.color?.a<=.001||layer.skeleton.color?.a<=.001||hidden.has(index+':'+slot.data.name))continue;
  let vertices;if(a instanceof ns.RegionAttachment){vertices=new Float32Array(8);a.computeWorldVertices('sequence' in a?slot:slot.bone,vertices,0,2);}else if(a instanceof ns.MeshAttachment){vertices=new Float32Array(a.worldVerticesLength);a.computeWorldVertices(slot,0,vertices.length,vertices,0,2);}else continue;
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;for(let i=0;i<vertices.length;i+=2){minX=Math.min(minX,vertices[i]);maxX=Math.max(maxX,vertices[i]);minY=Math.min(minY,vertices[i+1]);maxY=Math.max(maxY,vertices[i+1]);}
  rectangles.push({name:slot.data.name,bounds:[minX,minY,maxX,maxY]});
 }});return portraitFrameBounds(id,rectangles);
}
