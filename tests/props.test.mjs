import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {filterProps,isCurrentSelection,nextSelection,normalizePropsManifest,propCategories,validAssetPath} from '../web/src/props.js';

const root=new URL('../../../../',import.meta.url);
const exported=JSON.parse(readFileSync(new URL('../web/assets/props/manifest.json',import.meta.url)));

test('prop export manifest has 28 valid, uniquely selectable props',()=>{
 const props=normalizePropsManifest(exported);
 assert.equal(props.length,28);
 assert.equal(new Set(props.map(prop=>prop.id)).size,28);
 assert.deepEqual(propCategories(props),['All','Exterior','Interior']);
 assert.ok(props.every(prop=>validAssetPath(prop.model)&&validAssetPath(prop.preview)));
});

test('prop filters combine category and case-insensitive search',()=>{
 const props=normalizePropsManifest(exported);
 const interiors=filterProps(props,'','Interior');
 assert.ok(interiors.length>0&&interiors.every(prop=>prop.category==='Interior'));
 const stool=filterProps(props,'STOOL','All');
 assert.deepEqual(stool.map(prop=>prop.id),['int-stool']);
 assert.deepEqual(filterProps(props,'no such asset','All'),[]);
});

test('the latest prop selection wins asynchronous loading races',()=>{
 const first=nextSelection({id:null,request:0},'int-stool');
 const second=nextSelection(first,'int-bed');
 assert.equal(isCurrentSelection(second,first),false);
 assert.equal(isCurrentSelection(second,second),true);
});

test('prop manifest rejects unsafe model paths and invalid dimensions',()=>{
 assert.throws(()=>normalizePropsManifest({version:1,props:[{id:'bad',name:'Bad',category:'Interior',model:'../bad.glb',dimensions:[1,1,1]}]}));
 assert.throws(()=>normalizePropsManifest({version:1,props:[{id:'flat',name:'Flat',category:'Interior',model:'flat.glb',dimensions:[1,0,1]}]}));
});
