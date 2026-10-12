#!/usr/bin/env python3
"""Package existing native exports and a verified legacy asset catalogue.

No geometry is changed. Archives contain ordinary portable files, not symlinks.
Existing output files are refused so a previous release remains recoverable.
"""
import argparse,hashlib,json,zipfile,shutil
from pathlib import Path

def digest(path):
 h=hashlib.sha256()
 with path.open('rb')as f:
  for block in iter(lambda:f.read(1024*1024),b''):h.update(block)
 return h.hexdigest()
def record(path,url):return {'filename':path.name,'bytes':path.stat().st_size,'sha256':digest(path),'url':url+'/'+path.name}
def clean(value):
 if isinstance(value,list):return [clean(q)for q in value]
 if isinstance(value,dict):return {k:clean(v)for k,v in value.items()if k not in ['source','sourceFile','sourceSHA256','seconds','additionalSources','sourceParts']}
 return value
def make_zip(path,entries):
 if path.exists():raise RuntimeError('Refusing to overwrite '+str(path))
 with zipfile.ZipFile(path,'w',zipfile.ZIP_DEFLATED,compresslevel=6,allowZip64=True)as z:
  for source,target in entries:z.write(source,target)
 print('PACKAGED',path.name,path.stat().st_size,flush=True)
def main():
 p=argparse.ArgumentParser();p.add_argument('--exports',required=True,type=Path);p.add_argument('--legacy-assets',required=True,type=Path);p.add_argument('--weathered-legacy',required=True,type=Path);p.add_argument('--out',required=True,type=Path);p.add_argument('--release',required=True);a=p.parse_args();root=Path(__file__).resolve().parents[1];a.out.mkdir(parents=True,exist_ok=True);assets=a.out/'assets';assets.mkdir(exist_ok=True);base='https://github.com/holokat/building-studio/releases/download/'+a.release
 catalog=json.loads((root/'downloads.json').read_text());original=[q for q in catalog['assets']if not q['id'].startswith('skyborn-r')];models=json.loads((a.exports/'native-model-manifest.json').read_text());rows=[];entries=[]
 for q in original:
  source=a.weathered_legacy/q['filename'];source=source if source.exists()else a.legacy_assets/q['filename']
  if not source.exists():raise FileNotFoundError(source)
  link=assets/source.name
  if not link.exists():link.symlink_to(source.resolve())
  rows.append({**q,**record(source,base)});entries.append((source,'assets/'+source.name))
 for building in models['buildings']:
  code=building['id'][-3:];source=a.exports/'models'/building['model'];filename='skyborn-building-'+building['name'].lower().replace(' ','-')+'.glb';link=assets/filename
  if not link.exists():
   if code=='r00':shutil.copy2(source,link)
   else:link.symlink_to(source.resolve())
  if code=='r00':source=link
  download={**record(source,base),'filename':filename,'url':base+'/'+filename};row={'id':building['id'],'name':building['name'],'category':'Buildings',**download};rows.append(row);building['download']=download;building['model']='assets/'+filename;building['collision']='collision/'+code+'-collision.glb';export=json.loads((a.exports/'models'/(code+'-export.json')).read_text());building['collisionComponents']=export['collisionComponents'];building['preview']='previews/'+code+'-front.png';entries.extend([(source,'assets/'+filename),(a.exports/'models'/(code+'-collision.glb'),building['collision'])])
 library=json.loads((a.exports/'textures/active-library.json').read_text());maps=sorted({v for mat in library['materials']for v in mat['maps'].values()});portable=a.out/'exploration.json';portable.write_text(json.dumps(clean(models),indent=2));texture_manifest=a.out/'texture-library.json';texture_manifest.write_text(json.dumps(library,indent=2));license=root/'licenses/CC0-1.0.txt';texture_entries=[(a.exports/'textures'/q,'textures/'+q)for q in maps]+[(texture_manifest,'textures/library.json'),(license,'LICENSE-CC0-1.0.txt')]
 texture_zip=a.out/'skyborn-material-library.zip';make_zip(texture_zip,texture_entries)
 entries.extend(texture_entries);entries.append((portable,'exploration.json'))
 entries.extend((q,'previews/'+q.name)for q in sorted((a.exports/'previews').glob('r??-*.png')))
 catalog={'version':2,'license':'CC0-1.0','assets':rows,'materials':record(texture_zip,base),'pack':{'filename':'skyborn-buildings-and-props.zip','url':base+'/skyborn-buildings-and-props.zip'}};catalog_file=a.out/'downloads.json';catalog_file.write_text(json.dumps(catalog,indent=2));entries.append((catalog_file,'downloads.json'));pack=a.out/'skyborn-buildings-and-props.zip';make_zip(pack,entries);catalog['pack']=record(pack,base);catalog_file.write_text(json.dumps(catalog,indent=2));print('CATALOG',len(rows),len(maps),'texture files',flush=True)
 web_manifest=json.loads((root/'web/assets/exploration/manifest.json').read_text());downloads={q['id']:q for q in rows}
 for q in web_manifest['buildings']:q['download']={k:downloads[q['id']][k]for k in['filename','url','bytes','sha256']}
 (root/'web/assets/exploration/manifest.json').write_text(json.dumps(clean(web_manifest)))
 runtime_entries=[(q,str(q.relative_to(root/'web')))for folder in ['assets','vendor','previews','library-previews']for q in sorted((root/'web'/folder).rglob('*'))if q.is_file()and q.name not in ['export-report.json','manifest-next.json']];
 for index,(source,target)in enumerate(runtime_entries):
  if source.name=='manifest.json':
   copy=a.out/'runtime-manifests'/target;copy.parent.mkdir(parents=True,exist_ok=True);copy.write_text(json.dumps(clean(json.loads(source.read_text()))));runtime_entries[index]=(copy,target)
 runtime_entries.append((catalog_file,'downloads.json'));runtime=a.out/'browser-runtime.zip';make_zip(runtime,runtime_entries);(a.out/'runtime.json').write_text(json.dumps(record(runtime,base),indent=2));(a.out/'release-inventory.json').write_text(json.dumps({'release':a.release,'asset_count':len(rows),'building_count':sum(q['category']=='Buildings'for q in rows),'prop_count':sum(q['category']=='Props'for q in rows),'reusable_maps':len(maps),'archives':[record(q,base)for q in[pack,texture_zip,runtime]]},indent=2))
if __name__=='__main__':main()
