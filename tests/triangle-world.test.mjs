import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import test from 'node:test';
const triangleModule=existsSync(new URL('../web/src/triangle-world.js',import.meta.url))?'../web/src/triangle-world.js':'../src/triangle-world.js';
const {PLAYER_HEIGHT,PLAYER_RADIUS,STAIR_RISE,TriangleWorld,triangle}=await import(triangleModule);

function quad(a,b,c,d){return [triangle(a,b,c),triangle(a,c,d)];}
function floor(x0,x1,y0,y1,z){return quad([x0,y0,z],[x1,y0,z],[x1,y1,z],[x0,y1,z]);}
function wallX(x,y0,y1,z0,z1){return quad([x,y0,z0],[x,y1,z0],[x,y1,z1],[x,y0,z1]);}
function world(triangles){return new TriangleWorld(triangles,{groundZ:-10});}
function box(x0,x1,y0,y1,z0,z1,component=null){return [
 ...quad([x0,y0,z0],[x0,y1,z0],[x1,y1,z0],[x1,y0,z0]).map(t=>({...t,component})),
 ...quad([x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]).map(t=>({...t,component})),
 ...quad([x0,y0,z0],[x0,y0,z1],[x1,y0,z1],[x1,y0,z0]).map(t=>({...t,component})),
 ...quad([x1,y0,z0],[x1,y0,z1],[x1,y1,z1],[x1,y1,z0]).map(t=>({...t,component})),
 ...quad([x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0]).map(t=>({...t,component})),
 ...quad([x0,y1,z0],[x0,y1,z1],[x1,y1,z1],[x1,y1,z0]).map(t=>({...t,component}))
];}

test('native controller has the specified 0.60 m body width and 1.80 m head clearance',()=>{
 assert.equal(PLAYER_RADIUS*2,.6);assert.equal(PLAYER_HEIGHT,1.8);assert.ok(STAIR_RISE>=.2);
 const low=world([...floor(-2,2,-2,2,0),...quad([-2,-2,1.75],[-2,2,1.75],[2,2,1.75],[2,-2,1.75])]);
 assert.equal(low.clear([0,0,.006]),false,'a ceiling below 1.80 m blocks the whole player, not only an eye ray');
});

test('walls resolve against the capsule body and cannot be crossed in a long frame',()=>{
 const w=world([...floor(-2,2,-2,2,0),...wallX(1,-2,2,0,2.8)]),start=w.ground([0,0,0]);
 const after=w.move(start,[3,0,0],{dt:.5});assert.ok(after[0]<.71,`body crossed a solid wall at ${after[0]}`);
});

test('a 0.60 m portal remains passable while a narrower portal blocks the capsule',()=>{
 const open=(width)=>[...floor(-2,2,-2,2,0),...wallX(1,-2,-width/2,0,2.8),...wallX(1,width/2,2,0,2.8)];
 const through=world(open(.6)),blocked=world(open(.59));
 assert.ok(through.move(through.ground([0,0,0]),[1.4,0,0],{dt:.5})[0]>1);
 assert.ok(blocked.move(blocked.ground([0,0,0]),[1.4,0,0],{dt:.5})[0]<.95);
});

test('0.20 m stair treads are walkable and unsupported movement falls under gravity',()=>{
 const stairs=world([...floor(-2,0,-1,1,0),...floor(0,1,-1,1,.2),...floor(1,2,-1,1,.4)]);
 const top=stairs.move(stairs.ground([-.4,0,0]),[1.8,0,0],{dt:1});assert.ok(top[2]>.39&&top[2]<.42,`stair did not rise: ${top[2]}`);
 const drop=world([...floor(-2,0,-1,1,1),...floor(0,3,-1,1,0)]);let feet=drop.ground([-.5,0,1]);for(let i=0;i<20;i++)feet=drop.move(feet,[.08,0,0],{dt:1/30});assert.ok(feet[2]<.05,`gravity did not settle: ${feet[2]}`);
});

test('closed 0.20 m risers, 0.80 m stair clearance, and descent resolve as authored solids',()=>{
 const steps=[...box(0,.25,-.4,.4,-.2,0),...box(.25,.5,-.4,.4,-.2,.2),...box(.5,.75,-.4,.4,-.2,.4),...box(.75,1,-.4,.4,-.2,.6)];
 const w=world([...floor(-2,0,-1,1,0),...steps]);
 const start=w.ground([-.45,0,0]),top=w.move(start,[1.3,0,0],{dt:1});
 assert.ok(top[2]>.59&&top[2]<.62,`closed risers blocked ascent at ${top[2]}`);
 const down=w.move(top,[-1.3,0,0],{dt:1});assert.ok(down[2]<.02,`closed risers blocked descent at ${down[2]}`);
});

test('sloped ceilings test the capsule shoulder and a closed-solid bookmark is rejected',()=>{
 const slope=[triangle([-.5,-1,1.95],[-.5,1,1.95],[.5,1,1.55]),triangle([-.5,-1,1.95],[.5,1,1.55],[.5,-1,1.55])];
 const roof=world([...floor(-2,2,-2,2,0),...slope]);assert.equal(roof.clear([.4,0,.006]),false,'sloped roof intersects the head sphere away from the center ray');
 const solid=new TriangleWorld([...floor(-1,1,-1,1,0),...box(-2,2,-2,2,-1,3,'room-solid')],{groundZ:-10,solidComponents:['room-solid']});
 const embedded=solid.ground([0,0,0]);assert.equal(solid.clear(embedded),true,'far closed faces alone do not look like a contact');assert.equal(solid.validSpawn(embedded),false,'parity check rejects a player enclosed by a structural solid');
});

test('authored route points exercise the same collision controller used by walking',()=>{
 const w=world([...floor(-2,2,-1,1,0),...wallX(.75,-1,-.31,0,2.8),...wallX(.75,.31,1,0,2.8)]);
 assert.equal(w.walkRoute([[-1,0,0],[1.2,0,0]]).ok,true);
 assert.equal(w.walkRoute([[-1,.6,0],[1.2,.6,0]]).ok,false);
});

test('a small cobble between floor probes is stepped over without reducing body clearance',()=>{
 const bump=box(.075,.125,.075,.125,0,.08,'cobble'),ground=floor(-2,2,-2,2,0);
 const w=new TriangleWorld([...ground,...bump],{groundZ:-10,solidComponents:['cobble']});
 const after=w.move(w.ground([-.5,0,0]),[1,0,0],{dt:.5});assert.ok(after[0]>.4,'the ankle capsule must clear a low stone between the cardinal floor probes');
 const ceiling=quad([-2,-2,1.84],[-2,2,1.84],[2,2,1.84],[2,-2,1.84]);
 const low=new TriangleWorld([...ground,...bump,...ceiling],{groundZ:-10,solidComponents:['cobble']});assert.ok(low.move(low.ground([-.5,0,0]),[1,0,0],{dt:.5})[0]<.4,'stepping up cannot squeeze the full-height body through a low ceiling');
 const high=new TriangleWorld([...ground,...box(.075,.125,.075,.125,0,.30,'tall')],{groundZ:-10,solidComponents:['tall']});assert.ok(high.move(high.ground([-.5,0,0]),[1,0,0],{dt:.5})[0]<.4,'an obstacle above the step limit stays solid');
});

test('route verification rejects matching XY on the wrong storey',()=>{
 const w=world(floor(-2,2,-2,2,0));
 assert.equal(w.walkRoute([[-1,0,0],[1,0,0]]).ok,true);
 const wrong=w.walkRoute([[-1,0,0],[1,0,3]]);assert.equal(wrong.ok,false);assert.match(wrong.reason,/wrong height/);assert.ok(wrong.feet[2]<.1);
});
