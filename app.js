/* Vietflexmap DigitalTwin demo controller.
  All network assets and demands are synthetic; DEM/OSM are real open-data layers.
  Never label the JS solver as official EPANET. */
(function(){'use strict';
const P=window.TwinPhysics,T=window.DEMMapzen,$=id=>document.getElementById(id);
const nfmt=(x,n=2)=>Number.isFinite(+x)?(+x).toFixed(n):'—';
let state=JSON.parse(JSON.stringify(P.BASE)),current=null,series=[],viewer=null,dem=null,demMesh=null,agentProposal=null,optResult=null,runIndex=0,animation=null,flowLayer=null;
const escapeHTML=t=>String(t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(s){const e=$('toast');e.textContent=s;e.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove('show'),4200)}
function jsonDownload(filename,content,mime='application/json'){
 const blob=new Blob([content],{type:mime+';charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000)
}
function values(){
 state.scenario=$('scenario').value;state.route=$('route').value;state.hour=+$('hour').value;
 state.head=+$('head').value;state.capacity=+$('capacity').value;state.roughness=+$('roughness').value;
 state.demand=+$('demand').value;state.diameters=[0,1,2,3,4].map(i=>+$('diam'+i).value);
 state.elevationOverride=$('elevationToggle').checked&&dem?dem.pointHeights:null;
 $('hourValue').textContent=String(state.hour).padStart(2,'0')+':00';
 $('headValue').textContent=nfmt(state.head,0);
 $('capacityValue').textContent=nfmt(state.capacity);
 $('roughnessValue').textContent=nfmt(state.roughness,0);
 $('demandValue').textContent=nfmt(state.demand)+'×';
 return state;
}
function fields(){for(const [k,id] of [['scenario','scenario'],['route','route'],['hour','hour'],['head','head'],['capacity','capacity'],['roughness','roughness'],['demand','demand']])$(id).value=state[k];
 state.diameters.forEach((d,i)=>$('diam'+i).value=d);values();}
function api(){return $('apiUrl').value.trim().replace(/\/+$/,'')}
async function post(path,payload){
 const endpoint=api();if(!endpoint)throw Error('Chưa cấu hình URL dịch vụ Python EPANET/WNTR.');
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),60000);
 try{const response=await fetch(endpoint+path,{method:'POST',mode:'cors',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:controller.signal});
 const data=await response.json();if(!response.ok)throw Error(data.detail||('API HTTP '+response.status));return data}
 finally{clearTimeout(timeout)}
}
function setEngineStatus(txt,good){$('engineBadge').textContent=txt;$('engineBadge').style.color=good?'#69edc4':'#ffc17a'}
function localSim(){current=P.simulate(state);series=P.day(state);setEngineStatus('JS minh họa · chưa kiểm định',false)}
async function run(refreshDay=true){
 const index=++runIndex;values();$('runBtn').disabled=true;$('runBtn').textContent='Đang tính…';
 try{
  if($('engine').value==='epanet'){
   const result=await post('/api/simulate',state);if(index!==runIndex)return;
   current=result;if(refreshDay){const d=await post('/api/day',state);if(index!==runIndex)return;series=d.series}
   setEngineStatus('EPANET 2.2 · WNTR server',true);
  }else localSim();
  if(index!==runIndex)return;
  render();toast('Đã giải lại mô hình · '+(current.engine||'JS'));
 }catch(e){
  if(index===runIndex){setEngineStatus('EPANET không khả dụng',false);toast('Lỗi máy chủ: '+e.message+' — không tự gán kết quả JS thành EPANET')}
 }finally{if(index===runIndex){$('runBtn').disabled=false;$('runBtn').textContent='▶ Chạy mô phỏng'}}
}
function render(){
 if(!current)return;
 $('kFlow').textContent=nfmt(current.sourceFlow,3);
 $('kCoverage').textContent=nfmt(current.coverage*100,1)+'%';
 $('kPressure').textContent=nfmt(current.minP,1)+' m';
 $('kPressure').style.color=current.minP>=15?'var(--green)':'var(--red)';
 $('kCost').textContent=nfmt(current.cost,1);
 $('kPhysics').textContent=current.quality.physicsPass?'ĐẠT':'CẢNH BÁO';
 $('kPhysics').style.color=current.quality.physicsPass?'var(--green)':'var(--red)';
 $('kResidual').textContent='ΣQ '+nfmt(current.quality.maxMass,8)+' | ΣH '+nfmt(current.quality.maxEnergy,8);
 $('nodeRows').innerHTML=current.nodes.map(n=>'<tr><td>'+escapeHTML(n.name)+'</td><td>'+nfmt(n.z,1)+'</td><td class="'+(n.id==='SRC'||n.pressure>=15?'':'bad')+'">'+(n.id==='SRC'?'—':nfmt(n.pressure,2))+'</td><td>'+nfmt(n.delivered,3)+'</td><td>'+n.households+'</td></tr>').join('');
 $('pipeRows').innerHTML=current.pipes.map(p=>'<tr><td>'+p.id+'</td><td>'+p.diameter+'</td><td>'+nfmt(p.flow,3)+'</td><td class="'+(p.velocity>2?'bad':'')+'">'+nfmt(p.velocity,3)+'</td><td>'+nfmt(p.loss,4)+'</td></tr>').join('');
 const q=current.quality;
 const qa=[['Bảo toàn khối lượng',nfmt(q.maxMass,9)+' L/s',q.maxMass<1e-6],
 ['Bảo toàn năng lượng',nfmt(q.maxEnergy,9)+' m',q.maxEnergy<1e-5],
 ['Hội tụ',q.converged?'Đạt':'Chưa đạt',q.converged],
 ['Chất lượng dịch vụ',q.servicePass?'Đạt giới hạn':'Cần điều chỉnh',q.servicePass],
 ['Phân phối khi thiếu nguồn',q.capacityRationing?'JS phân bổ tổng hợp':'Không cần phân bổ',true],
 ['Trạng thái dữ liệu','100% mạng giả định',true]];
 $('verification').innerHTML=qa.map(a=>'<div><small>'+a[0]+'</small><b style="color:'+(a[2]?'var(--green)':'var(--red)')+'">'+a[1]+'</b></div>').join('');
 plot();renderHourTelemetry();updateGeoEntities();
}

function renderHourTelemetry(){
 const arr=Array.isArray(series)?series:[];
 const label=P.SCENARIOS[state.scenario]?.name||state.scenario;
 $('scenarioActive').textContent=label+' · GIẢ ĐỊNH';
 $('scenarioHour').textContent=String(state.hour).padStart(2,'0')+':00';
 const volume=arr.reduce((total,s)=>total+(Number(s.sourceFlow)||0)*3.6,0);
 const peak=arr.length?Math.max(...arr.map(s=>Number(s.sourceFlow)||0)):0;
 $('scenarioVolume').textContent=nfmt(volume,2)+' m³/ngày';
 $('scenarioPeak').textContent=nfmt(peak,3)+' L/s';
 $('hourRows').innerHTML=arr.map(s=>{
   const h=Number(s.hour),q=s.quality||{};
   const status=!q.physicsPass?'Chưa đạt ràng buộc':s.coverage<.95?'Thiếu nước':s.minP<15?'Áp lực thấp':'Đạt mô phỏng';
   const klass=h===state.hour?'hour-selected':'';
   const safeScenario=escapeHTML(P.SCENARIOS[s.scenario]?.name||s.scenario||label);
   return '<tr data-hour="'+h+'" class="'+klass+'"><td>'+String(h).padStart(2,'0')+':00</td><td>'+safeScenario+
    '</td><td>'+nfmt(s.totalDemand,3)+'</td><td>'+nfmt(s.totalDelivered,3)+'</td><td>'+nfmt(s.coverage*100,1)+
    '%</td><td>'+nfmt(s.minP,2)+'</td><td class="'+(q.servicePass?'good':'bad')+'">'+status+'</td></tr>';
 }).join('');
}
// Read-only diagnostics for field-demo QA and automated visual-motion verification.
window.__twinFlowDebug=()=>flowLayer?.snapshot()||null;
function flowStatus(){
 const snap=flowLayer?.snapshot();
 if(!snap){$('flowReadout').textContent='Hạt nước động cần CesiumJS; các kết quả thủy lực vẫn được tính độc lập.';return}
 const velocities=snap.streams.filter(a=>a.active).map(a=>a.velocity);
 const avg=velocities.length?velocities.reduce((a,b)=>a+b,0)/velocities.length:0;
 const travel=snap.streams.filter(a=>a.active).map(a=>a.visualTravelSeconds);
 const meanTravel=travel.length?travel.reduce((a,b)=>a+b,0)/travel.length:0;
 $('flowReadout').textContent='Tốc độ trung bình: '+nfmt(avg,3)+' m/s · Lưu lượng nguồn: '+nfmt(current?.sourceFlow||0,3)+
 ' L/s · Hạt đang phát: '+snap.active+'/'+snap.count+' · Qua một ống khoảng '+nfmt(meanTravel,1)+
 ' giây hình ảnh (×'+snap.timeScale+') · Mạng ống giả định';
}
function seekHour(hour){
 const h=Math.max(0,Math.min(23,Math.round(Number(hour)||0)));
 $('hour').value=h;values();
 const model=series.find(s=>Number(s.hour)===h);
 if(model && model.scenario===state.scenario){current=model;render();}
 else run();
}
function exportHourly(){
 if(!series.length){toast('Chưa có chuỗi kết quả 24 giờ');return}
 const header=['hour','scenario','engine','source_flow_Lps','demand_Lps','delivered_Lps','coverage_percent','minimum_pressure_m','physics_pass','synthetic'];
 const rows=series.map(x=>[x.hour,x.scenario,x.engine,nfmt(x.sourceFlow,7),nfmt(x.totalDemand,7),
  nfmt(x.totalDelivered,7),nfmt(x.coverage*100,5),nfmt(x.minP,5),x.quality.physicsPass,true]);
 jsonDownload('digitaltwin_'+state.scenario+'_24h_SYNTHETIC.csv',[header,...rows].map(r=>r.join(',')).join('\n'),'text/csv');
}

function plot(){
 const canvas=$('chart'),w=canvas.width,h=canvas.height,ctx=canvas.getContext('2d');
 ctx.clearRect(0,0,w,h);ctx.fillStyle='#0c2335';ctx.fillRect(0,0,w,h);
 if(!series?.length)return;
 const max=Math.max(0.5,...series.map(x=>x.sourceFlow),...series.map(x=>x.totalDemand))*1.22;
 const X=i=>36+i*(w-55)/23,Y=q=>h-28-q/max*(h-55);
 ctx.strokeStyle='#284356';ctx.lineWidth=1;ctx.font='11px system-ui';ctx.fillStyle='#89a5b8';
 for(let i=0;i<5;i++){const val=max*i/4,y=Y(val);ctx.beginPath();ctx.moveTo(36,y);ctx.lineTo(w-12,y);ctx.stroke();ctx.fillText(val.toFixed(1),4,y+4)}
 for(let i=0;i<24;i+=4)ctx.fillText(String(i).padStart(2,'0')+'h',X(i)-10,h-8);
 for(const [key,col] of [['totalDemand','#e5a86d'],['sourceFlow','#49e4e7']]){
 ctx.strokeStyle=col;ctx.lineWidth=2.8;ctx.beginPath();series.forEach((s,i)=>i?ctx.lineTo(X(i),Y(s[key])):ctx.moveTo(X(i),Y(s[key])));ctx.stroke();}
 ctx.strokeStyle='#accbff';ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(X(state.hour),20);ctx.lineTo(X(state.hour),h-28);ctx.stroke();ctx.setLineDash([]);
 ctx.fillStyle='#49e4e7';ctx.fillText('● Lưu lượng cấp',w-255,18);ctx.fillStyle='#e5a86d';ctx.fillText('● Nhu cầu',w-129,18);
}
function mapHeight(n){return Number.isFinite(dem?.pointHeights?.[n.id])?dem.pointHeights[n.id]+8:Math.max(n.z,0)}
function updateGeoEntities(){
 if(!viewer||!window.Cesium)return;const C=Cesium;
 viewer.entities.removeAll();const colored=current?.pipes||P.PIPES.map((p,i)=>({...p,diameter:state.diameters[i]}));
 colored.forEach(p=>{
  const a=P.NODES[p.a],b=P.NODES[p.b],max=Number.isFinite(p.velocity)?p.velocity:0;
  viewer.entities.add({id:p.id,name:'Ống giả định '+p.id,polyline:{positions:C.Cartesian3.fromDegreesArrayHeights([a.lon,a.lat,mapHeight(a),b.lon,b.lat,mapHeight(b)]),
   width:Math.max(3,(p.diameter||40)/17),material:max>2?C.Color.ORANGERED:C.Color.CYAN,clampToGround:false},
   description:'<b>Giả định:</b> '+p.id+'; đường kính '+(p.diameter||'—')+' mm; lưu lượng '+nfmt(p.flow||0)+' L/s'});
 });
 P.NODES.forEach((n,i)=>{
  const result=current?.nodes?.[i];
  viewer.entities.add({id:n.id,name:n.name,position:C.Cartesian3.fromDegrees(n.lon,n.lat,mapHeight(n)+5),
   point:{pixelSize:i===0?15:12,color:i===0?C.Color.DODGERBLUE:i===1?C.Color.CYAN:C.Color.ORANGE,outlineColor:C.Color.WHITE,outlineWidth:2,
    heightReference:C.HeightReference.NONE},
   label:{text:n.id,fillColor:C.Color.WHITE,font:'bold 12px Arial',outlineColor:C.Color.BLACK,outlineWidth:3,style:C.LabelStyle.FILL_AND_OUTLINE,pixelOffset:new C.Cartesian2(0,-21),
    distanceDisplayCondition:new C.DistanceDisplayCondition(0,18000)},
   description:'<b>Dữ liệu giả định</b><p>Cao độ sử dụng: '+nfmt(result?.z??n.z,1)+' m</p><p>Áp lực: '+nfmt(result?.pressure??0,2)+' m</p>'});
 });
 if(window.TwinFlow?.FlowAnimation){
  if(!flowLayer)flowLayer=new window.TwinFlow.FlowAnimation(viewer);
  flowLayer.setOptions({enabled:$('flowToggle').checked,timeScale:+$('flowSpeed').value,density:+$('flowDensity').value});
  flowLayer.sync(colored,P.NODES,mapHeight);
 }
 flowStatus();
}
function flyToArea(){
 if(!viewer)return;viewer.camera.flyTo({destination:Cesium.Cartesian3.fromDegrees(103.891,21.328,5200),
 orientation:{heading:Cesium.Math.toRadians(0),pitch:Cesium.Math.toRadians(-56),roll:0},duration:1.2})
}
async function loadMap(){
 if(!window.Cesium){$('geoStatus').textContent='CesiumJS CDN không truy cập được. Các mô hình vẫn tính được.';return}
 try{
  Cesium.Ion.defaultAccessToken='';
  viewer=new Cesium.Viewer('cesiumMap',{animation:false,timeline:false,homeButton:false,fullscreenButton:false,geocoder:false,
   navigationHelpButton:false,sceneModePicker:false,baseLayerPicker:false,infoBox:true,selectionIndicator:true,
   terrainProvider:new Cesium.EllipsoidTerrainProvider(),baseLayer:false});
  viewer.imageryLayers.removeAll();
  viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({url:'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
   maximumLevel:19,credit:'© OpenStreetMap contributors'}));
  viewer.scene.globe.depthTestAgainstTerrain=false;
  viewer.scene.globe.enableLighting=true;
  flyToArea();updateGeoEntities();
 }catch(e){$('geoStatus').textContent='Cesium chưa khởi tạo: '+e.message;viewer=null}
}
async function loadDEM(){
 $('geoStatus').textContent='Đang đọc pixel cao độ DEM Mapzen tại khu vực minh họa...';
 try{
  dem=await T.area(P.NODES);
  if(viewer){if(demMesh)viewer.scene.primitives.remove(demMesh);demMesh=T.createSurface(viewer,dem);demMesh.show=$('demToggle').checked;}
  $('geoStatus').innerHTML='<b style="color:var(--green)">DEM thật đã đọc thành công</b><div>Mapzen Terrain Tiles · AWS Open Data · EPSG:3857 raster</div><div>6 điểm độ cao mẫu · lưới 25 × 25</div>';
  $('demLabel').textContent='DEM Mapzen: '+nfmt(Math.min(...Object.values(dem.pointHeights)),0)+'–'+nfmt(Math.max(...Object.values(dem.pointHeights)),0)+' m';
  if($('elevationToggle').checked){const src=dem.pointHeights.SRC;state.head=src+35;$('head').min=Math.floor(src-60);$('head').max=Math.ceil(src+160);$('head').value=state.head}
  values();run();toast('DEM thật đã nạp; mạng đường ống và lưu lượng vẫn là dữ liệu giả định.');
 }catch(e){dem=null;$('geoStatus').textContent='Không thể lấy DEM thật: '+e.message+'; không sử dụng DEM giả thay thế.';
 $('demLabel').textContent='DEM: nguồn không khả dụng';$('elevationToggle').checked=false;updateGeoEntities();toast('Không tải được DEM nguồn mở — '+e.message)}
}
function agent(){
 if(!current)return;
 const q=current.quality,notes=[],suggest={scenario:state.scenario,route:state.route,demand:state.demand,diameters:state.diameters.slice()};
 if(!q.converged)notes.push('Mô hình chưa hội tụ; không dùng kết quả này để lựa chọn thiết kế.');
 if(current.coverage<.95){notes.push('Thiếu nước '+nfmt((1-current.coverage)*100,1)+'%: kiểm tra nguồn, áp lực và nhu cầu.');suggest.scenario='wet'}
 if(current.minP<15){notes.push('Áp lực thấp nhất dưới 15 m; cân nhắc giảm tổn thất hoặc chọn tuyến khác.');suggest.diameters=suggest.diameters.map(d=>Math.min(90,d+10))}
 if(current.maxP>60)notes.push('Có nút áp lực vượt 60 m: cần xem xét bể giảm áp/thiết bị bảo vệ.');
 if(q.capacityRationing)notes.push('Bộ giải JS đã phân bổ nhu cầu khi thiếu nguồn; kiểm định lại với EPANET/WNTR.');
 if(!notes.length)notes.push('Các điều kiện cơ bản đạt trong kịch bản giả định; tiếp tục thử hạn bất lợi và nhu cầu tăng.');
 notes.push('Khuyến nghị: chạy kịch bản '+(current.coverage<.95?'mùa mưa để xem giới hạn nguồn':'hạn bất lợi để đánh giá độ bền vững')+'.');
 if(current.coverage>=.95)suggest.scenario='drought';
 agentProposal=suggest;
 $('agentAnswer').textContent=notes.map((x,i)=>(i+1)+'. '+x).join('\n');
 $('agentApply').disabled=false;
}
function optRender(out){
 optResult=out;const rows=out.frontier||[];
 $('optInfo').textContent=(out.engine||'')+' · '+(out.evaluated||'—')+' phương án · Pareto: '+(out.allCount??rows.length);
 $('optRows').innerHTML=rows.slice(0,15).map((r,i)=>'<tr><td>'+(i+1)+'. '+r.route+' / '+r.diameters.join('-')+'</td><td>'+nfmt(r.cost,1)+'</td><td>'+nfmt(r.deficit*100,2)+'</td><td>'+nfmt(r.risk,2)+'</td><td class="'+(r.feasible?'good':'bad')+'">'+(r.feasible?'Có':'Không')+'</td><td><button data-opt="'+i+'">Chọn</button></td></tr>').join('')||'<tr><td colspan="6">Không có phương án khả thi</td></tr>';
 $('optRows').querySelectorAll('[data-opt]').forEach(b=>b.addEventListener('click',()=>{const r=rows[+b.dataset.opt];
 state.route=r.route;state.diameters=r.diameters.slice();fields();run();toast('Đã chọn phương án Pareto giả định '+r.id)}));
}
async function optimize(){
 $('optBtn').disabled=true;$('optBtn').textContent='Đang tối ưu…';values();
 try{
  const result=$('engine').value==='epanet'?await post('/api/optimize',state):P.optimization(state);
  optRender(result);toast('Đã hoàn thành '+(result.evaluated||0)+' phép đánh giá phương án');
 }catch(e){toast('Không thể tối ưu: '+e.message)}
 finally{$('optBtn').disabled=false;$('optBtn').textContent='◈ Chạy tối ưu Pareto'}
}
function csv(){
 if(!current)return;
 const rows=[['type','id','elevation_m','pressure_m','requested_Lps','delivered_Lps','diameter_mm','pipe_flow_Lps','velocity_mps','headloss_m']];
 for(const n of current.nodes)rows.push(['node',n.id,n.z,n.pressure,n.requested,n.delivered,'','','','']);
 for(const p of current.pipes)rows.push(['pipe',p.id,'','','','',p.diameter,p.flow,p.velocity,p.loss]);
 jsonDownload('digitaltwin_synthetic_results.csv',rows.map(r=>r.join(',')).join('\n'),'text/csv')
}
function geojson(){const data={type:'FeatureCollection',name:'Synthetic mountain water network',synthetic:true,
 features:[
 ...P.NODES.map(n=>({type:'Feature',geometry:{type:'Point',coordinates:[n.lon,n.lat]},properties:{id:n.id,name:n.name,synthetic:true,households:n.households}})),
 ...P.PIPES.map((p,i)=>({type:'Feature',geometry:{type:'LineString',coordinates:[[P.NODES[p.a].lon,P.NODES[p.a].lat],[P.NODES[p.b].lon,P.NODES[p.b].lat]]},properties:{id:p.id,synthetic:true,diameter_mm:state.diameters[i]}}))]};
 jsonDownload('digitaltwin_synthetic_network.geojson',JSON.stringify(data,null,2))
}
function init(){
 fields();
 for(const id of ['scenario','route','hour','head','capacity','roughness','demand',...Array.from({length:5},(_,i)=>'diam'+i)])
 $(id).addEventListener('input',()=>{values();if($('engine').value==='js')run();else{setEngineStatus('EPANET: cần chạy lại',false);toast('Bấm Chạy mô phỏng để tính lại bằng EPANET')}});
 $('engine').addEventListener('change',()=>{setEngineStatus($('engine').value==='js'?'JS minh họa':'Cần kết nối EPANET',false);$('runBtn').click()});
 $('runBtn').addEventListener('click',()=>run());
 $('autoBtn').addEventListener('click',()=>{
  if(animation){clearInterval(animation);animation=null;$('autoBtn').textContent='⏯ Chạy 24 giờ';return}
  $('autoBtn').textContent='■ Dừng · 24 giờ';animation=setInterval(()=>seekHour((+($('hour').value)+1)%24),1600)
 });
 $('resetBtn').addEventListener('click',()=>{state=JSON.parse(JSON.stringify(P.BASE));fields();run()});
 $('agentBtn').addEventListener('click',agent);
 $('agentApply').addEventListener('click',()=>{if(!agentProposal)return;state.scenario=agentProposal.scenario;state.route=agentProposal.route;
  state.diameters=agentProposal.diameters.map((x,i)=>{const opts=[...$('diam'+i).options].map(o=>+o.value);return opts.reduce((p,c)=>Math.abs(c-x)<Math.abs(p-x)?c:p)});
  fields();run();toast('Đã áp dụng kịch bản agent đề xuất, không điều khiển công trình')});
 $('optBtn').addEventListener('click',optimize);
 $('jsonBtn').addEventListener('click',()=>current&&jsonDownload('digitaltwin_simulation.json',JSON.stringify({metadata:{data:'synthetic',terrainSource:dem?.source||null,engine:current.engine,generated:new Date().toISOString(),limitations:'not field validated'},options:state,simulation:current,hourlySyntheticSeries:series,flowAnimation:flowLayer?.snapshot()||null,pareto:optResult},null,2)));
 $('csvBtn').addEventListener('click',csv);
 $('inpBtn').addEventListener('click',()=>jsonDownload('digitaltwin_synthetic_network.inp',P.inp(state),'text/plain'));
 $('geoBtn').addEventListener('click',geojson);
 $('hourlyBtn').addEventListener('click',exportHourly);
 $('hourRows').addEventListener('click',e=>{const tr=e.target.closest('tr[data-hour]');if(tr)seekHour(+tr.dataset.hour)});
 $('flowToggle').addEventListener('change',()=>{flowLayer?.setOptions({enabled:$('flowToggle').checked});flowStatus()});
 $('flowSpeed').addEventListener('input',()=>{$('flowSpeedValue').textContent=$('flowSpeed').value+'×';
  flowLayer?.setOptions({timeScale:+$('flowSpeed').value});flowStatus()});
 $('flowDensity').addEventListener('input',()=>{$('flowDensityValue').textContent=$('flowDensity').value+'/ống';
  if(flowLayer)updateGeoEntities();flowStatus()});
 $('demToggle').addEventListener('change',()=>{if(demMesh)demMesh.show=$('demToggle').checked});
 $('elevationToggle').addEventListener('change',()=>{if($('elevationToggle').checked&&!dem){$('elevationToggle').checked=false;toast('Cần nạp được DEM thực trước khi áp dụng cao độ')}else if($('elevationToggle').checked){
  const src=dem.pointHeights.SRC;state.head=src+35;$('head').min=Math.floor(src-60);$('head').max=Math.ceil(src+160);$('head').value=state.head;run()
 }else{$('head').min=800;$('head').max=1050;state.head=942;fields();run()}});
 $('reloadDEM').addEventListener('click',loadDEM);
 $('flyBtn').addEventListener('click',flyToArea);
 localSim();render();loadMap().then(loadDEM);
}
document.addEventListener('DOMContentLoaded',init);
})();