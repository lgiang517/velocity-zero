"""Build the credited car-DJ bass edit from Kevin MacLeod's official recording."""
from pathlib import Path
import subprocess,json,re,urllib.request,hashlib
ROOT=Path(__file__).resolve().parents[1];work=ROOT/'output/music-dj';work.mkdir(parents=True,exist_ok=True)
source=work/'raving-energy-faster-source.mp3'
url='https://incompetech.com/music/royalty-free/mp3-royaltyfree/Raving%20Energy%20%28faster%29.mp3'
if not source.exists():urllib.request.urlretrieve(url,source)
# Preserve tempo/pitch. Emphasize kick/sub bass while removing muddy low mids.
eq='highpass=f=28,bass=g=4:f=95:w=0.7,equalizer=f=260:t=q:w=0.8:g=-1.5,treble=g=-1:f=6500'
measure=subprocess.run(['ffmpeg','-hide_banner','-i',str(source),'-af',eq+',loudnorm=I=-12:TP=-1.5:LRA=7:print_format=json','-f','null','-'],capture_output=True,text=True,check=True)
report=json.loads(re.findall(r'\{[^{}]+\}',measure.stderr)[-1]);(work/'source-eq-analysis.json').write_text(json.dumps(report,indent=2))
norm='loudnorm=I=-12:TP=-1.5:LRA=7:linear=true:'+':'.join(f'{k}={report[v]}' for k,v in [('measured_I','input_i'),('measured_TP','input_tp'),('measured_LRA','input_lra'),('measured_thresh','input_thresh'),('offset','target_offset')])
output=ROOT/'public/audio/raving-energy-car-dj.mp3'
subprocess.run(['ffmpeg','-v','error','-y','-i',str(source),'-af',eq+','+norm,'-ar','44100','-ac','2','-c:a','libmp3lame','-b:a','192k','-map_metadata','-1','-metadata','title=Raving Energy (faster) - Car DJ bass edit','-metadata','artist=Kevin MacLeod','-metadata','comment=CC BY 4.0; low-frequency EQ and loudness adaptation for Velocity Zero',str(output)],check=True)
print(json.dumps({'file':str(output),'bytes':output.stat().st_size,'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'bpm':134},indent=2))
