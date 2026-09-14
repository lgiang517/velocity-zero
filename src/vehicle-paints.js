// Three official representative finishes plus two user-reference colors per model.
// These are not a sales/popularity ranking.
// sRGB approximations for the existing game paint shader, not factory paint codes.
const referencePaints=[
  {id:'reference-orange',name:'Gloss Orange',zh:'亮橙色',color:'#ef6808'},
  {id:'reference-yellow',name:'Solar Yellow',zh:'明黄色',color:'#edc600'},
];
export const VEHICLE_PAINTS = {
  db12: [
    {id:'iridescent-emerald',name:'Iridescent Emerald',zh:'翡翠绿',color:'#167154'},
    {id:'hyper-red',name:'Hyper Red',zh:'炽烈红',color:'#a51930'},
    {id:'silver-birch',name:'Silver Birch',zh:'桦木银',color:'#b6b9b1'},
    ...referencePaints,
  ],
  gtc4lusso: [
    {id:'rosso-fuoco',name:'Rosso Fuoco',zh:'烈焰红',color:'#b91c25'},
    {id:'bianco-italia',name:'Bianco Italia',zh:'意大利白',color:'#e8e8e0'},
    {id:'grigio-silverstone',name:'Grigio Silverstone',zh:'银石灰',color:'#51565b'},
    ...referencePaints,
  ],
  f812: [
    {id:'grigio-competizione',name:'Grigio Competizione',zh:'竞速灰',color:'#858c90'},
    {id:'rosso-corsa',name:'Rosso Corsa',zh:'赛车红',color:'#d01820'},
    {id:'giallo-tristrato',name:'Giallo Tristrato',zh:'三层珍珠黄',color:'#efbd19'},
    ...referencePaints,
  ],
};
export function paintOptions(carId){return VEHICLE_PAINTS[carId] || VEHICLE_PAINTS.db12;}
export function resolvePaint(carId,saved){return paintOptions(carId).find(p=>p.color===saved || p.id===saved) || paintOptions(carId)[0];}
export function restorePaintSelections(storage={}){
  return Object.fromEntries(Object.keys(VEHICLE_PAINTS).map(id=>[id,resolvePaint(id,storage?.paints?.[id] ?? (storage?.car===id?storage.paint:undefined)).color]));
}
