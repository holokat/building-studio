// The original nine buildings mark stone explicitly in the runtime manifest.
// Keep this predicate narrow so wood, plaster, slate, ceramics, and metal retain
// their authored finishes.
export const WEATHERED_LEGACY_STONE={
 baseColor:'textures/weathered-stone/SKYBORN_WeatheredStone__REF_stone_dark-083a3c-grain-v3_base_color.png',
 roughness:'textures/weathered-stone/SKYBORN_WeatheredStone__REF_stone_dark-083a3c-grain-v3_roughness.png',
 normal:'textures/weathered-stone/SKYBORN_WeatheredStone__REF_stone_dark-083a3c-grain-v3_normal.png',
};
export function isLegacyStoneMaterial(material){return material?.kind==='stone';}
export function weatheredLegacyStoneSpec(material,maps=WEATHERED_LEGACY_STONE){
 if(!isLegacyStoneMaterial(material))return material;
 return {...material,color:[.76,.72,.65],map:maps.baseColor,normal:maps.normal,roughnessMap:maps.roughness,roughness:.98,metalness:0,normalScale:.78,weatheredStone:true,paint:null,overlay:null,tintFactor:0,surfaceUVTransform:[1,1,0,0]};
}
export function weatherLegacyMaterialList(materials,maps=WEATHERED_LEGACY_STONE){return materials.map(material=>weatheredLegacyStoneSpec(material,maps));}
// Download GLBs have the same authored marker in material extras. Props do not,
// which intentionally leaves all 28 prop files untouched.
export function isLegacyStoneDownloadMaterial(material){return material?.extras?.skybornBrowserMaterial?.kind==='stone';}
