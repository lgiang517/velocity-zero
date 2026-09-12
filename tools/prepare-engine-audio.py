"""Create one five-second CC0 Ferrari startup cue; requires FFmpeg.
Source: PritzProductions, https://freesound.org/people/PritzProductions/sounds/241083/
"""
from pathlib import Path
import subprocess
root=Path(__file__).resolve().parents[1]
subprocess.run(['ffmpeg','-v','error','-y','-ss','1.35','-t','5','-i',str(root/'public/audio/engine/ferrari-360-source.mp3'),'-ac','1','-af','highpass=f=65,lowpass=f=4200,acompressor=threshold=0.125:ratio=2:attack=20:release=120,loudnorm=I=-20:TP=-6:LRA=7,afade=t=in:d=0.045,afade=t=out:st=4.25:d=0.75','-ar','44100','-c:a','pcm_s16le',str(root/'public/audio/engine/ferrari-start-5s.wav')],check=True)
