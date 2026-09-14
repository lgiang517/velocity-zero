import {existsSync,rmSync,writeFileSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {execFileSync} from 'node:child_process';
// Keep archived development fixtures in the repository, not in the live Pages bundle.
const root=resolve('dist');
const retired=[
 'models/gt-seat.glb','models/solstice-gt.glb','models/solstice-lux-gt.glb',
 'audio/edm-detection-mode-kevin-macleod.mp3','audio/exhilarate-kevin-macleod.mp3',
 'audio/engine/ferrari-360-source.mp3',
];
for(const relative of retired){
 const file=resolve(root,relative);
 if(!file.startsWith(root+sep))throw new Error('Release asset escaped dist');
 if(existsSync(file))rmSync(file);
}
const revision=process.env.GITHUB_SHA||execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
writeFileSync(resolve(root,'version.json'),JSON.stringify({revision,builtAt:new Date().toISOString(),cars:['db12','gtc4lusso','f812'],colorsPerCar:5,music:['raving-energy','cipher']},null,2)+'\n');
console.log('Current release bundle prepared: '+revision.slice(0,7));
