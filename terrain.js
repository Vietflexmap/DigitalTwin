/* Open DEM: Mapzen Terrain Tiles, AWS public dataset (Terrarium PNG).
  Formula: height_m = red*256 + green + blue/256 - 32768.
  No synthetic height substitution: failure is visible to users.
  DEM provenance: https://registry.opendata.aws/terrain-tiles/
  OpenStreetMap provides background IMAGERY, NOT the DEM. */
(function(g){'use strict';
const Z=12,URL='https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const cache=new Map();
function tilePosition(lon,lat,z=Z){
 const n=2**z;const x=(lon+180)/360*n;const rad=lat*Math.PI/180;
 const y=(1-Math.asinh(Math.tan(rad))/Math.PI)/2*n;
 return {x,y,tx:Math.floor(x),ty:Math.floor(y)};
}
function getTile(x,y,z=Z){
 const key=[z,x,y].join('/');
 if(cache.has(key))return cache.get(key);
 const promise=new Promise((res,rej)=>{
  const img=new Image();img.crossOrigin='anonymous';
  img.onload=()=>{try{
    const c=document.createElement('canvas');c.width=256;c.height=256;
    const cx=c.getContext('2d',{willReadFrequently:true});cx.drawImage(img,0,0,256,256);
    const pixels=cx.getImageData(0,0,256,256).data;res(pixels);
  }catch(e){rej(new Error('Không đọc được ảnh DEM (CORS/canvas): '+e.message))}};
  img.onerror=()=>rej(new Error('Không tải được DEM từ kho dữ liệu Mapzen/AWS'));
  img.src=URL.replace('{z}',z).replace('{x}',x).replace('{y}',y);
 });
 cache.set(key,promise);return promise;
}
async function sample(lon,lat,z=Z){
 const p=tilePosition(lon,lat,z),bytes=await getTile(p.tx,p.ty,z);
 const px=Math.max(0,Math.min(255,Math.floor((p.x-p.tx)*256))),
 py=Math.max(0,Math.min(255,Math.floor((p.y-p.ty)*256)));
 const i=(py*256+px)*4;
 if(bytes[i+3]===0)throw new Error('Pixel DEM không có dữ liệu');
 return bytes[i]*256+bytes[i+1]+bytes[i+2]/256-32768;
}
async function area(nodes,padding=.003){
 const lonMin=Math.min(...nodes.map(n=>n.lon))-padding,lonMax=Math.max(...nodes.map(n=>n.lon))+padding;
 const latMin=Math.min(...nodes.map(n=>n.lat))-padding,latMax=Math.max(...nodes.map(n=>n.lat))+padding;
 const size=25,grid=[],pointHeights={};
 // At most a few distinct raster tiles at zoom 12; requests are cached.
 for(let y=0;y<size;y++){
  const line=[];
  for(let x=0;x<size;x++){
   const lon=lonMin+(lonMax-lonMin)*x/(size-1),lat=latMax-(latMax-latMin)*y/(size-1);
   line.push({lon,lat,h:await sample(lon,lat)});
  }grid.push(line);
 }
 for(const n of nodes)pointHeights[n.id]=await sample(n.lon,n.lat);
 return {grid,pointHeights,size,extent:[lonMin,latMin,lonMax,latMax],source:'Mapzen Terrain Tiles / AWS Open Data',unit:'m',synthetic:false};
}
function createSurface(viewer,dem){
 if(!g.Cesium)throw new Error('CesiumJS chưa nạp');
 const C=g.Cesium,grid=dem.grid,N=grid.length,xyz=[],indices=[];
 for(const line of grid)for(const v of line){
  const p=C.Cartesian3.fromDegrees(v.lon,v.lat,v.h-1);
  xyz.push(p.x,p.y,p.z)
 }
 for(let j=0;j<N-1;j++)for(let i=0;i<N-1;i++){
  const a=j*N+i,b=a+1,c=a+N,d=c+1;
  indices.push(a,c,b,b,c,d)
 }
 const positionArray=new Float64Array(xyz);
 const geometry=new C.Geometry({
  attributes:{position:new C.GeometryAttribute({componentDatatype:C.ComponentDatatype.DOUBLE,componentsPerAttribute:3,values:positionArray})},
  indices:new Uint16Array(indices),primitiveType:C.PrimitiveType.TRIANGLES,
  boundingSphere:C.BoundingSphere.fromVertices(positionArray)
 });
 const color=C.Color.fromCssColorString('#1b7481').withAlpha(.52);
 const mesh=new C.Primitive({
  geometryInstances:new C.GeometryInstance({geometry,attributes:{color:C.ColorGeometryInstanceAttribute.fromColor(color)}}),
  appearance:new C.PerInstanceColorAppearance({flat:true,translucent:true,closed:false}),
  asynchronous:false,show:true
 });
 viewer.scene.primitives.add(mesh);return mesh;
}
g.DEMMapzen={sample,area,createSurface,source:URL,attribution:'Mapzen Terrain Tiles / AWS Open Data',zoom:Z};
})(typeof window!=='undefined'?window:globalThis);