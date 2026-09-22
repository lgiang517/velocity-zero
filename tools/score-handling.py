"""Score recorded handling evidence using TypeSafe. This is an offline developer tool."""
import argparse, json, os, time, urllib.request, urllib.error
from pathlib import Path

DIMENSIONS = {
    'steering': ('转向响应', 25, 'Direction correctness, brief-tap responsiveness and smooth full-lock response at tested speeds.'),
    'recovery': ('回正与反打', 20, 'Prompt opposite steering and stable release without continuing to turn or oscillate.'),
    'braking': ('制动控制', 15, 'Braking overrides throttle and nitro, stops predictably and respects lower wet grip.'),
    'reverse': ('倒车控制', 10, 'Reverse steering has correct yaw sign and remains responsive throughout tested reverse speeds.'),
    'touch': ('手机触控与适配', 20, 'Independent simultaneous fingers, cancellation, safe rotation/resume, reachable controls and viewport alignment.'),
    'fluidity': ('驾驶流畅度', 10, 'Observed frame cadence and resize behavior preserve responsive play on the tested host, without pretending it is a physical phone benchmark.'),
}
LEVELS = [
    'Unusable in the measured scenarios: repeatable reversed control or stuck input, frequent severe frame stalls, or inaccessible core controls.',
    'Major repeatable failure in the measured scenarios makes normal control unreliable, although some scenarios succeed.',
    'Basic control works but a measured significant issue disrupts a normal workflow, such as stale rendering dimensions after viewport resize, unsafe input lifecycle or inconsistent steering recovery.',
    'Measured core behavior is reliable, with a minor demonstrated weakness or missing relevant targeted verification; no major failure in available evidence.',
    'All relevant supplied targeted checks for this dimension pass with responsive, consistent behavior and no demonstrated defect in those checks. This level applies only to this bounded test scope, never universal perfection.',
]

def main():
    parser=argparse.ArgumentParser();parser.add_argument('evidence');parser.add_argument('--out',required=True);parser.add_argument('--reuse-unchanged');args=parser.parse_args()
    data=json.loads(Path(args.evidence).read_text(encoding='utf-8-sig'))
    key=os.environ.get('TYPESAFE_API_KEY')
    if not key:
        try:
            import winreg
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER,'Environment') as k:key=winreg.QueryValueEx(k,'TYPESAFE_API_KEY')[0]
        except (ImportError,OSError):pass
    if not key:raise SystemExit('TypeSafe credential unavailable; no request sent.')
    questions={key:{'type':'score','instructions':f'Evaluate only evidence.{key}. {desc} Rate game handling within the recorded scope. Distinguish failures of an AI driver or test harness from defects in the game. Do not assume untested physical phones work. Do not infer deficiencies solely because this is a game, nor reward claims without measurements.','criteria':LEVELS} for key,(_,_,desc) in DIMENSIONS.items()}
    reused={}
    if args.reuse_unchanged:
        prior_path=Path(args.reuse_unchanged);prior=json.loads(prior_path.read_text(encoding='utf-8-sig'));prior_request=json.loads(prior_path.with_suffix('.request.json').read_text(encoding='utf-8-sig'))
        for dimension in list(questions):
            if data[dimension]==prior_request['state']['evidence'].get(dimension):
                reused[dimension]=prior['answers'][dimension];del questions[dimension]
    if not questions:raise SystemExit('No changed evidence requires a new request.')
    body={'model':'jev-latest','state':{'purpose':'Bounded racing-game control QA. Scores are AI review of telemetry, not a human road test or manufacturer certification. Never place network AI in the driving control loop.','evidence':data},'questions':questions}
    out=Path(args.out);out.parent.mkdir(parents=True,exist_ok=True);out.with_suffix('.request.json').write_text(json.dumps(body,ensure_ascii=False,indent=2),encoding='utf-8')
    req=urllib.request.Request('https://api.typesafe.ai/v1/systemone',data=json.dumps(body).encode('utf-8'),headers={'Authorization':'Bearer '+key,'Content-Type':'application/json'},method='POST');started=time.perf_counter()
    try:
        with urllib.request.urlopen(req,timeout=60) as response:result=json.load(response)
    except Exception as error:
        status={'live':True,'ok':False,'errorType':type(error).__name__,'httpStatus':getattr(error,'code',None)};out.write_text(json.dumps(status),encoding='utf-8');raise SystemExit(json.dumps(status))
    answers={**reused,**result.get('answers',{})};scores={}
    for key,(label,weight,_) in DIMENSIONS.items():
        answer=answers.get(key,{})
        value=answer.get('score')
        if answer.get('type')!='score' or not isinstance(value,(float,int)) or not 0<=value<=4:raise SystemExit('Invalid or incomplete TypeSafe score; not reporting aggregate.')
        scores[key]={'label':label,'score100':round(value*25,2),'weight':weight,'confidence':answer.get('confidence')}
    result['audit']={'live':True,'ok':True,'elapsedSeconds':round(time.perf_counter()-started,3),'evidence':args.evidence,'scores':scores,'reusedUnchangedDimensions':list(reused),'reusedFrom':args.reuse_unchanged,'weightedScore100':round(sum(v['score100']*v['weight']/100 for v in scores.values()),2),'limitation':'AI interpretation of bounded desktop-host telemetry and browser mobile emulation; not physical-phone verification.'}
    out.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({'model':result.get('model'),'usage':result.get('usage'),'audit':result['audit']},ensure_ascii=True))
if __name__=='__main__':main()
