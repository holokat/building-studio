import * as THREE from 'three';

// A neutral reflection environment lets the Blender metal surfaces retain their
// working-face highlights. It contains no building geometry or replacement assets.
export function createMetalReflections(renderer){
 const studio=new THREE.Scene();studio.background=new THREE.Color(.22,.23,.24);
 const geometry=new THREE.PlaneGeometry(5,5),materials=[];
 for(const [position,color]of[[[-4,-4,6],[2.2,2.1,1.9]],[[4,1,3],[.9,1,1.1]],[[0,5,5],[.55,.58,.62]]]){
  const material=new THREE.MeshBasicMaterial({color:new THREE.Color(...color),side:THREE.DoubleSide});materials.push(material);
  const card=new THREE.Mesh(geometry,material);card.position.set(...position);card.lookAt(0,0,0);studio.add(card);
 }
 const generator=new THREE.PMREMGenerator(renderer),target=generator.fromScene(studio,.08,.1,30);
 generator.dispose();geometry.dispose();materials.forEach(m=>m.dispose());return target;
}
