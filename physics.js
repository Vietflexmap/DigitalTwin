/* Educational gravity-fed TREE solver. Not EPANET / WNTR.
   All water-network measurements, asset locations and demands are synthetic.
   Units: head/elevation/pressure [m]; pipe Q [L/s]; Hazen-Williams SI. */
(function(g){'use strict';
const NODES=[
{id:'SRC',name:'Nguồn giả định',lon:103.8890,lat:21.3325,z:927,demand:0,households:0},
{id:'J1',name:'Nút phân phối',lon:103.8920,lat:21.3288,z:912,demand:0,households:0},
{id:'H1',name:'Cụm dân cư A',lon:103.8961,lat:21.3265,z:903,demand:.38,households:42},
{id:'H2',name:'Cụm dân cư B',lon:103.8866,lat:21.3254,z:909,demand:.33,households:37},
{id:'H3',name:'Cụm dân cư C',lon:103.8998,lat:21.3217,z:895,demand:.42,households:48},
{id:'H4',name:'Cụm dân cư D',lon:103.8842,lat:21.3208,z:897,demand:.36,households:41}];
const PIPES=[{id:'P01',a:0,b:1,len:510},{id:'P12',a:1,b:2,len:490},{id:'P13',a:1,b:3,len:525},{id:'P24',a:2,b:4,len:440},{id:'P35',a:3,b:5,len:535}];
const ROUTES={A:{name:'Tuyến ngắn',len:[.87,.91,.92,.93,.9],trench:[1.23,1.24,1.23,1.25,1.22]},B:{name:'Bám đường',len:[1,1,1,1,1],trench:[1,1,1,1,1]},C:{name:'Men sườn',len:[1.16,1.18,1.20,1.19,1.13],trench:[.84,.8,.79,.83,.82]}};
const SCENARIOS={dry:{name:'Mùa kiệt',headShift:0,capFactor:1,demandFactor:1},wet:{name:'Mùa mưa',headShift:3,capFactor:1.3,demandFactor:1},drought:{name:'Hạn bất lợi',headShift:-8,capFactor:.62,demandFactor:1.07},peak:{name:'Nhu cầu tăng',headShift:-1,capFactor:1,demandFactor:1.42}};
const COST={25:31000,32:39000,40:53000,50:72000,63:105000,75:147000,90:200000};
const BASE={scenario:'dry',route:'B',hour:10,head:942,capacity:2,roughness:130,demand:1,diameters:[63,50,50,40,40],elevationOverride:null};
const PRESSURE_REQUIRED=15,PRESSURE_MAX=60;
const fmt=x=>Number(x).toFixed(3), clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const hours=h=>.66+.45*Math.exp(-Math.pow((h-7.5)/2.4,2))+.46*Math.exp(-Math.pow((h-19)/2.7,2));
const loss=(len,q,d,C)=>Math.abs(q)<1e-12?0:10.67*len*Math.pow(Math.abs(q)/1000,1.852)/(Math.pow(C,1.852)*Math.pow(d/1000,4.871));
const velocity=(q,d)=>(Math.abs(q)/1000)/(Math.PI*Math.pow(d/1000,2)/4);
const pdd=(pressure)=>pressure<=0?0:pressure>=PRESSURE_REQUIRED?1:Math.sqrt(pressure/PRESSURE_REQUIRED);
function opt(o){return {...BASE,...(o||{}),diameters:o?.diameters?o.diameters.slice():BASE.diameters.slice()}}
function params(o){const s=SCENARIOS[o.scenario]||SCENARIOS.dry;return {h:o.head+s.headShift,cap:o.capacity*s.capFactor,mult:o.demand*s.demandFactor*hours(o.hour)};}
function elevations(o){return NODES.map(n=>{const z=o.elevationOverride?.[n.id];return Number.isFinite(z)?z:n.z})}
function network(o,delivered,z,h,lengths){
 const q=[delivered[2]+delivered[3]+delivered[4]+delivered[5],delivered[2]+delivered[4],delivered[3]+delivered[5],delivered[4],delivered[5]];
 const H=[h,0,0,0,0,0];
 PIPES.forEach((p,k)=>{H[p.b]=H[p.a]-loss(lengths[k],q[k],o.diameters[k],o.roughness)});
 return {q,H,p:H.map((a,i)=>a-z[i])};
}
function simulate(options){
 const o=opt(options),sp=params(o),z=elevations(o),route=ROUTES[o.route]||ROUTES.B,lengths=PIPES.map((p,i)=>p.len*route.len[i]);
 const requested=NODES.map(n=>n.demand*sp.mult);let calcCount=0;
 function solve(scale){
  let del=requested.map(x=>x*scale),last=0,converged=false;
  for(let j=0;j<850;j++){
   let hyd=network(o,del,z,sp.h,lengths);
   const next=requested.map((x,i)=>i<2?0:x*scale*pdd(hyd.p[i]));
   last=Math.max(...next.map((x,i)=>Math.abs(x-del[i])));
   const damping=.28;
   del=next.map((x,i)=>del[i]*(1-damping)+x*damping);calcCount++;
   if(last<1e-9){converged=true;break;}
  }
  return {del,s:network(o,del,z,sp.h,lengths),converged,last};
 }
 let r=solve(1),fraction=1,capNoted=false;
 if(r.s.q[0]>sp.cap+1e-8){
  capNoted=true;let lo=0,hi=1;
  for(let j=0;j<26;j++){const mid=(lo+hi)/2;if(solve(mid).s.q[0]>sp.cap)hi=mid;else lo=mid}
  fraction=lo;r=solve(lo);
 }
 const flows=r.s.q,heads=r.s.H,pressure=r.s.p;
 const demand=requested.reduce((a,b)=>a+b,0),delivered=r.del.reduce((a,b)=>a+b,0);
 const mass=NODES.slice(1).map((n,k)=>{
  const i=k+1;
  let incoming=0,outgoing=0;
  PIPES.forEach((p,j)=>{if(p.b===i)incoming+=flows[j];if(p.a===i)outgoing+=flows[j]});
  return Math.abs(incoming-outgoing-r.del[i])
 });
 const losses=PIPES.map((p,i)=>loss(lengths[i],flows[i],o.diameters[i],o.roughness));
 const energy=PIPES.map((p,i)=>Math.abs(heads[p.a]-heads[p.b]-losses[i]));
 const speeds=flows.map((q,i)=>velocity(q,o.diameters[i]));
 const maxMass=Math.max(...mass),maxEnergy=Math.max(...energy);
 const minP=Math.min(...pressure.slice(2)),maxP=Math.max(...pressure.slice(2));
 const coverage=demand>0?delivered/demand:1;
 const physicsPass=r.converged&&maxMass<1e-6&&maxEnergy<1e-5&&flows[0]<=sp.cap+1e-4;
 const servicePass=physicsPass&&coverage>=.95&&minP>=PRESSURE_REQUIRED&&maxP<=PRESSURE_MAX&&Math.max(...speeds)<=2;
 const nodes=NODES.map((n,i)=>({...n,z:z[i],pressure:pressure[i],head:heads[i],requested:requested[i],delivered:r.del[i]}));
 const pipes=PIPES.map((p,i)=>({...p,diameter:o.diameters[i],length:lengths[i],flow:flows[i],loss:losses[i],velocity:speeds[i]}));
 return {engine:'js-educational',synthetic:true,scenario:o.scenario,hour:o.hour,options:o,nodes,pipes,sourceFlow:flows[0],
 totalDemand:demand,totalDelivered:delivered,coverage,minP,maxP,cost:cost(o),quality:{maxMass,maxEnergy,physicsPass,servicePass,converged:r.converged,iterations:calcCount,capacityRationing:capNoted,allocatedFraction:fraction,
 warning:'JS demo uses uniform source rationing when source capacity is exceeded; this is NOT an EPANET valve/control model.'}};
}
function cost(o){const r=ROUTES[o.route]||ROUTES.B;return PIPES.reduce((a,p,i)=>a+p.len*r.len[i]*COST[o.diameters[i]]*r.trench[i],0)/1e6}
function day(options){return Array.from({length:24},(_,h)=>simulate({...options,hour:h}))}
function penalty(s){const p=s.nodes.slice(2).reduce((a,n)=>a+Math.max(0,PRESSURE_REQUIRED-n.pressure)+Math.max(0,n.pressure-PRESSURE_MAX)*.4,0);
return p+Math.max(0,Math.max(...s.pipes.map(x=>x.velocity))-2)*10+(s.quality.converged?0:1e4)}
function dominates(a,b){return a.f.every((x,i)=>x<=b.f[i]+1e-7)&&a.f.some((x,i)=>x<b.f[i]-1e-7)}
function pareto(rows){return rows.filter(a=>!rows.some(b=>a!==b&&dominates(b,a)))}
function optimization(base){const opts=opt(base),rows=[];let id=0;
 for(const r of ['A','B','C'])for(const trunk of [50,63,75,90])for(const mid of [32,40,50,63])for(const tail of [25,32,40,50]){
  const o={...opts,route:r,diameters:[trunk,mid,mid,tail,tail]};
  const s=simulate(o);
  const dry=simulate({...o,scenario:'drought'});
  const deficit=1-.55*s.coverage-.45*dry.coverage;
  const pressureRisk=Math.max(penalty(s),penalty(dry));
  rows.push({id:++id,route:r,diameters:o.diameters,cost:cost(o),deficit:Math.max(0,deficit),risk:pressureRisk,
   feasible:s.quality.physicsPass&&dry.quality.physicsPass,f:[cost(o),Math.max(0,deficit)*100,pressureRisk]});
 }
 const feasible=rows.filter(x=>x.feasible);
 const frontier=pareto(feasible).sort((a,b)=>a.cost-b.cost);
 // Deterministic ranking, normalized weighted sum for illustrative decision aid (not TOPSIS)
 const ranges=[0,1,2].map(i=>{const a=frontier.map(x=>x.f[i]);return [Math.min(...a),Math.max(...a)]});
 for(const a of frontier)a.score=a.f.reduce((sum,v,i)=>sum+[.4,.4,.2][i]*(v-ranges[i][0])/Math.max(1e-6,ranges[i][1]-ranges[i][0]),0);
 frontier.sort((a,b)=>a.score-b.score);
 return {engine:'js-enumeration',evaluated:rows.length,feasible:feasible.length,frontier:frontier.slice(0,40),best:frontier[0]||null,objectives:['cost_MVND','unmet_weighted_pct','pressure_risk'],allCount:frontier.length}
}
function inp(options){const o=opt(options),r=ROUTES[o.route]||ROUTES.B,z=elevations(o),p=params(o);
 const j=NODES.slice(1).map((n,i)=>[n.id,fmt(z[i+1]),Number(n.demand*p.mult).toFixed(6)].join(' ')).join('\n');
 const pl=PIPES.map((t,i)=>[t.id,NODES[t.a].id,NODES[t.b].id,fmt(t.len*r.len[i]),fmt(o.diameters[i]),fmt(o.roughness),0,'Open'].join(' ')).join('\n');
 const co=NODES.map(n=>n.id+' '+n.lon+' '+n.lat).join('\n');
 return '[TITLE]\n; SYNTHETIC MODEL — NOT AN ENGINEERING DESIGN\n[JUNCTIONS]\n;ID Elevation Demand(L/s) — UNITS LPS\n'+j+
 '\n[RESERVOIRS]\nSRC '+fmt(p.h)+'\n[PIPES]\n;ID Node1 Node2 Length(m) Diameter(mm) Roughness MinorLoss Status\n'+pl+
 '\n[OPTIONS]\nUNITS LPS\nHEADLOSS H-W\nDEMAND MODEL PDA\nMINIMUM PRESSURE 0\nREQUIRED PRESSURE 15\n[COORDINATES]\n'+co+'\n[END]\n';
}
g.TwinPhysics={NODES,PIPES,ROUTES,SCENARIOS,BASE,loss,velocity,simulate,day,optimization,inp,params,cost};
if(typeof module!=='undefined'&&module.exports)module.exports=g.TwinPhysics;
})(typeof window!=='undefined'?window:globalThis);