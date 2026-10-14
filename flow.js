/* Flow Animation for CesiumJS — particles advance along real synthetic pipe flow.
   Motion is tied to solved signed discharge and velocity, NOT random CSS animation.
   Visual playback time is accelerated for legibility; not field measurements. */
(function(root){'use strict';
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function speedFromFlow(flowLps, diameterMm){
  if(!Number.isFinite(flowLps)||!Number.isFinite(diameterMm)||diameterMm<=0)return 0;
  const area=Math.PI*Math.pow(diameterMm/1000,2)/4;
  return Math.abs(flowLps)/1000/area;
}
function timeAdvance(position, velocity, length, timeScale, deltaSeconds, direction=1){
  if(!Number.isFinite(length)||length<=0||!Number.isFinite(deltaSeconds))return position;
  const advance=velocity*Math.max(0,timeScale)*Math.max(0,deltaSeconds)/length*(direction<0?-1:1);
  return ((position+advance)%1+1)%1;
}
class FlowAnimation {
 constructor(viewer){
   this.viewer=viewer;this.C=root.Cesium;this.particles=[];this.streams=[];
   this.enabled=true;this.timeScale=240;this.density=7;this.lastTick=0;this.frame=0;this.listenersAttached=false;
   this.tick=this.tick.bind(this);this.attach();
 }
 attach(){if(!this.listenersAttached&&this.viewer?.scene?.preRender){this.viewer.scene.preRender.addEventListener(this.tick);this.listenersAttached=true}}
 detach(){if(this.listenersAttached){this.viewer.scene.preRender.removeEventListener(this.tick);this.listenersAttached=false}}
 setOptions({enabled,timeScale,density}={}){
   if(enabled!==undefined)this.enabled=Boolean(enabled);
   if(timeScale!==undefined)this.timeScale=clamp(Number(timeScale)||240,1,3600);
   if(density!==undefined)this.density=clamp(Math.round(Number(density)||7),1,18);
   this.particles.forEach(p=>{p.entity.show=this.enabled&&p.active});
 }
 clear(){for(const p of this.particles){if(this.viewer?.entities?.getById(p.entity.id))this.viewer.entities.remove(p.entity)}
   this.particles=[];this.streams=[]}
 destroy(){this.detach();this.clear()}
 sync(pipes,nodes,getHeight){
   if(!this.C||!Array.isArray(pipes)||!Array.isArray(nodes))return;
   const lastPhase=new Map(this.particles.map(p=>[p.key,p.progress]));
   this.clear();
   const C=this.C;
   for(const pipe of pipes){
     const from=nodes[pipe.a],to=nodes[pipe.b];if(!from||!to)continue;
     const start=C.Cartesian3.fromDegrees(from.lon,from.lat,getHeight(from)+13);
     const finish=C.Cartesian3.fromDegrees(to.lon,to.lat,getHeight(to)+13);
     const flow=Number(pipe.flow)||0;
     const velocity=Number.isFinite(pipe.velocity)?Math.abs(pipe.velocity):speedFromFlow(flow,pipe.diameter);
     const active=Math.abs(flow)>1e-8 && velocity>1e-8;
     const distance=Number(pipe.length??pipe.len)||1;
     const stream={id:pipe.id,flow,velocity,length:distance,from:pipe.a,to:pipe.b,
       travelSeconds:velocity>0?distance/velocity:null,visualTravelSeconds:velocity>0?distance/velocity/this.timeScale:null,
       direction:Math.sign(flow),active};
     this.streams.push(stream);
     // Use a fixed number per link, with evenly phased and recycled droplets.
     const count=this.density;
     for(let i=0;i<count;i++){
       const key=pipe.id+':'+i;
       const phase=lastPhase.has(key)?lastPhase.get(key):i/count;
       const marker={key,pipeId:pipe.id,flow,velocity,length:distance,from:start,to:finish,
         active,progress:phase,position:C.Cartesian3.lerp(start,finish,phase,new C.Cartesian3())};
       const color=velocity>2?C.Color.ORANGE:velocity>.8?C.Color.AQUAMARINE:C.Color.fromCssColorString('#8cf5ff');
       marker.entity=this.viewer.entities.add({
         id:'flow-'+pipe.id+'-'+i,name:'Giọt nước mô phỏng '+pipe.id,
         position:new C.CallbackProperty(()=>marker.position,false),
         point:{pixelSize:i%3===0?8:5,color:color.withAlpha(.98),
           outlineColor:C.Color.fromCssColorString('#103344'),outlineWidth:1,
           disableDepthTestDistance:Number.POSITIVE_INFINITY},
         show:this.enabled&&active,
         description:'Hạt nước trực quan, tính từ Q = '+flow.toFixed(3)+' L/s; v = '+velocity.toFixed(3)+' m/s; '
          +'tốc độ phát hình ×'+this.timeScale+'; dữ liệu mạng giả định.'
       });
       this.particles.push(marker);
     }
   }
   this.lastTick=0;
 }
 tick(){
   const now=(root.performance&&root.performance.now)?root.performance.now():Date.now();
   if(!this.lastTick){this.lastTick=now;return}
   const delta=clamp((now-this.lastTick)/1000,0,.12);this.lastTick=now;
   if(!this.enabled || delta<=0)return;
   const C=this.C;
   this.frame++;
   for(const p of this.particles){
     if(!p.active)continue;
     const progress=timeAdvance(p.progress,p.velocity,p.length,this.timeScale,delta,p.flow>=0?1:-1);
     p.progress=progress;
     C.Cartesian3.lerp(p.from,p.to,progress,p.position);
   }
 }
 snapshot(){
   return {running:this.enabled,timeScale:this.timeScale,density:this.density,frame:this.frame,
     count:this.particles.length,active:this.particles.filter(p=>p.active&&p.entity.show).length,
     streams:this.streams.map(s=>({...s})),
     firstPhase:this.particles.length?this.particles[0].progress:null};
 }
}
root.TwinFlow={FlowAnimation,speedFromFlow,timeAdvance};
if(typeof module!=='undefined'&&module.exports)module.exports={speedFromFlow,timeAdvance};
})(typeof window!=='undefined'?window:globalThis);
