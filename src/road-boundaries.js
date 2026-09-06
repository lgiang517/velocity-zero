// Shared dimensions for the rendered rail and the complete vehicle collision envelope.
export const BARRIER={offset:9.85,halfThickness:.07,bottom:.665,top:.915,clearance:.09};
export function vehicleEnvelope(config){return {halfWidth:1.20,halfLength:config.id==='muscle'?2.65:2.5};}
export function lateralExtent(config,yaw,curvature=0){
 const {halfWidth:w,halfLength:l}=vehicleEnvelope(config);
 // Includes body roll and the curved rail moving inward beside a rotated car.
 return Math.abs(Math.cos(yaw))*w+Math.abs(Math.sin(yaw))*l+.15+Math.abs(curvature)*(l+w)**2;
}
export function barrierLimit(config,yaw,curvature=0){return BARRIER.offset-BARRIER.halfThickness-BARRIER.clearance-lateralExtent(config,yaw,curvature);}

