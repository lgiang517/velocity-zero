import * as THREE from 'three';
/** Static geometry is split spatially so extending the route does not draw it all. */
export function addRoadChunks(scene,source,material,{name='Road',shadow=false,receive=true,size=320}={}){
 const p=source.attributes.position,index=source.index,buckets=new Map();
 const count=index?index.count:p.count;
 for(let i=0;i<count;i+=3){const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j);const x=ids.reduce((sum,k)=>sum+p.getX(k),0)/3,z=ids.reduce((sum,k)=>sum+p.getZ(k),0)/3,key=Math.floor(x/size)+':'+Math.floor(z/size);if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(...ids);}
 const meshes=[];
 for(const[key,ids]of buckets){const g=new THREE.BufferGeometry();for(const[attr,a]of Object.entries(source.attributes)){const data=new Float32Array(ids.length*a.itemSize);for(let i=0;i<ids.length;i++)for(let j=0;j<a.itemSize;j++)data[i*a.itemSize+j]=a.array[ids[i]*a.itemSize+j];g.setAttribute(attr,new THREE.BufferAttribute(data,a.itemSize));}g.computeBoundingBox();g.computeBoundingSphere();const m=new THREE.Mesh(g,material);m.name=name+' '+key;m.castShadow=shadow;m.receiveShadow=receive;scene.add(m);meshes.push(m);}
 source.dispose();return meshes;
}
