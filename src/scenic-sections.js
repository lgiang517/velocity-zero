// Deprecated fraction constants retained for archived scene audits only.
// Active China route builders must use track.section(id) and sectionS(id,p).
// They must never multiply these historical ranges by the extended total length.
export const SCENIC_SECTIONS=Object.freeze({
 sichuan:Object.freeze({start:.31,end:.385,region:'WESTERN SICHUAN VIADUCT'}),
 duku:Object.freeze({start:.39,end:.475,region:'DUKU HIGHWAY'}),
 hzmb:Object.freeze({start:.90,end:.993,region:'HONG KONG-ZHUHAI-MACAO BRIDGE'}),
});
export function scenicSectionAt(fraction){const t=((fraction%1)+1)%1;return Object.entries(SCENIC_SECTIONS).find(([,s])=>t>=s.start&&t<s.end)?.[0]||null;}
export function elevatedSectionAt(fraction){const section=scenicSectionAt(fraction);return section==='sichuan'||section==='hzmb';}
const smooth=(a,b,x)=>{const v=Math.max(0,Math.min(1,(x-a)/(b-a)));return v*v*(3-2*v);};
// Lower only the visible mountain floor under this viaduct. Nearest-road
// ownership prevents the canyon from cutting a neighbouring hairpin.
export function westernValleyHeight(baseHeight,fraction,roadDistance){
 const {start,end}=SCENIC_SECTIONS.sichuan;
 if(fraction<=start||fraction>=end||roadDistance>=82)return baseHeight;
 const along=smooth(start,start+.012,fraction)*(1-smooth(end-.012,end,fraction));
 return baseHeight-64*along*(1-smooth(20,82,roadDistance));
}
