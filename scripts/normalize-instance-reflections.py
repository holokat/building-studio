#!/usr/bin/env python3
"""Bake negative instance scale into reflected prototypes without moving vertices.

Requires NumPy in the author's export environment. The browser needs no package.
Only instanced prototypes and their TRS records change; materials, textures,
ordinary architecture and interactive parts are preserved.
"""
import argparse,copy,json,struct
from pathlib import Path
import numpy as np
DT={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'};SIZE={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}
def normalize(path):
 raw=path.read_bytes();length=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+length]);blob=bytearray(raw[28+length:]);fixed=0;groups=0;vertices=0
 def read(index):
  a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']];dt=np.dtype(DT[a['componentType']]);n=SIZE[a['type']];offset=v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',n*dt.itemsize)
  return np.ndarray((a['count'],n),dtype=dt,buffer=blob,offset=offset,strides=(stride,dt.itemsize)).copy()
 def append(values,source):
  a=copy.deepcopy(doc['accessors'][source]);values=np.ascontiguousarray(values,dtype=DT[a['componentType']]);blob.extend(b'\0'*((-len(blob))%4));offset=len(blob);blob.extend(values.tobytes());v=len(doc['bufferViews']);doc['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':values.nbytes});a['bufferView']=v;a['count']=len(values);a.pop('byteOffset',None);a.pop('sparse',None)
  if 'min'in a:a['min']=values.min(axis=0).tolist()
  if 'max'in a:a['max']=values.max(axis=0).tolist()
  index=len(doc['accessors']);doc['accessors'].append(a);return index
 mirrors={}
 def mirror_mesh(index,reflection):
  nonlocal vertices
  key=(index,tuple(reflection))
  if key in mirrors:return mirrors[key]
  m=copy.deepcopy(doc['meshes'][index]);m['name']=m.get('name','Prototype')+' reflected prototype'
  for p in m['primitives']:
   assert p.get('mode',4)==4 and 'indices'in p,'Expected indexed native triangles'
   for key in ['POSITION','NORMAL','TANGENT']:
    if key not in p['attributes']:continue
    a=p['attributes'][key];values=read(a);values[:,:3]*=reflection
    if key=='TANGENT':values[:,3]*=-1
    if key=='POSITION':vertices+=len(values)
    p['attributes'][key]=append(values,a)
   a=p['indices'];indices=read(a).reshape(-1,3);indices=indices[:,[0,2,1]].reshape(-1,1);p['indices']=append(indices,a)
  result=len(doc['meshes']);doc['meshes'].append(m);mirrors[key]=result;return result
 original_nodes=list(enumerate(doc['nodes']))
 for number,node in original_nodes:
  inst=node.get('extensions',{}).get('EXT_mesh_gpu_instancing');
  if not inst or 'SCALE'not in inst['attributes']:continue
  attrs=inst['attributes'];scale=read(attrs['SCALE']);negative=np.prod(scale,axis=1)<0
  if not negative.any():continue
  reflection=np.sign(scale[negative][0]);assert np.all(np.sign(scale[negative])==reflection),'Expected one reflection parity per native group'
  values={k:read(a)for k,a in attrs.items()};reflected=copy.deepcopy(node);reflected['name']=node.get('name','Native instances')+' reflected prototype';reflected['mesh']=mirror_mesh(node['mesh'],reflection);newattrs={}
  for key,value in values.items():
   selected=value[negative].copy()
   if key=='SCALE':
    selected*=reflection
    # Algebraic equality of every prototype vertex before quaternion/translation.
    for p in doc['meshes'][node['mesh']]['primitives']:
     v=read(p['attributes']['POSITION']);mv=v.copy();mv*=reflection
     for start in range(0,len(selected),128):
      old=v[None,:,:]*value[negative][start:start+128,None,:];new=mv[None,:,:]*selected[start:start+128,None,:];assert np.array_equal(old,new),'Instance vertex moved'
   newattrs[key]=append(selected,attrs[key])
  reflected['extensions']['EXT_mesh_gpu_instancing']['attributes']=newattrs
  if negative.all():doc['nodes'][number]=reflected
  else:
   node['extensions']['EXT_mesh_gpu_instancing']['attributes']={k:append(v[~negative],attrs[k])for k,v in values.items()};newindex=len(doc['nodes']);doc['nodes'].append(reflected)
   for parent in doc['nodes']:
    if number in parent.get('children',[]):parent['children'].append(newindex)
   for scene in doc['scenes']:
    if number in scene.get('nodes',[]):scene['nodes'].append(newindex)
  fixed+=int(negative.sum());groups+=1
 if fixed:
  doc['buffers'][0]['byteLength']=len(blob);text=json.dumps(doc,separators=(',',':')).encode();text+=b' '*((-len(text))%4);blob+=b'\0'*((-len(blob))%4);output=struct.pack('<4sII',b'glTF',2,28+len(text)+len(blob))+struct.pack('<II',len(text),0x4e4f534a)+text+struct.pack('<II',len(blob),0x004e4942)+blob;staged=path.with_name(path.stem+'-reflected.glb');staged.write_bytes(output);staged.replace(path)
 return {'file':path.name,'reflections_baked':fixed,'groups':groups,'prototype_vertices':vertices,'moved_vertices':0,'bytes':path.stat().st_size}
def main():
 p=argparse.ArgumentParser();p.add_argument('files',nargs='+',type=Path);p.add_argument('--report',type=Path);a=p.parse_args();rows=[normalize(q)for q in a.files]
 if a.report:a.report.write_text(json.dumps(rows,indent=2))
 print(json.dumps(rows,indent=2))
if __name__=='__main__':main()
