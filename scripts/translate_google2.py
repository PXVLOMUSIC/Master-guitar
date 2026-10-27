import json, os, sys, time, urllib.request, urllib.parse

SRC='data/lessons.json'
OUT='data/lessons.fr.json'
MAPPING='scripts/map.json'

data=json.load(open(SRC,encoding='utf-8'))

texts=set()
def walk_collect(o):
    if isinstance(o,dict):
        for k,v in o.items():
            if k in ('title','text','prompt') and isinstance(v,str):
                texts.add(v)
            elif k=='options' and isinstance(v,list):
                for item in v:
                    if isinstance(item,str): texts.add(item)
            else:
                walk_collect(v)
    elif isinstance(o,list):
        for item in o:
            walk_collect(item)
walk_collect(data)

def has_lowercase(s):
    return any(c.islower() for c in s)

# start fresh mapping
mapping={}

def translate_one(s):
    if not has_lowercase(s):
        return s
    q=urllib.parse.quote(s)
    url='https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=es&tl=fr&q='+q
    for attempt in range(8):
        try:
            with urllib.request.urlopen(url,timeout=30) as r:
                res=json.loads(r.read().decode('utf-8'))
            # res is list with one string
            if isinstance(res,list):
                return res[0]
            return str(res)
        except Exception as e:
            msg=str(e)
            if '429' in msg or 'Too Many' in msg:
                wait=30*(attempt+1)
            else:
                wait=5*(attempt+1)
            sys.stdout.write('wait %ds on %r: %s\n'%(wait,s,msg)); sys.stdout.flush()
            time.sleep(wait)
    raise RuntimeError('failed: '+s)

# translate all
lst=sorted(texts)
for i,s in enumerate(lst,1):
    try:
        mapping[s]=translate_one(s)
    except Exception as e:
        sys.stdout.write('ERR %r %s\n'%(s,e)); sys.stdout.flush()
        mapping[s]=s
    if i%10==0:
        print(i,'/',len(lst),flush=True)
    time.sleep(0.6)
    if i%50==0:
        json.dump(mapping,open(MAPPING,'w',encoding='utf-8'),ensure_ascii=False,indent=2)

json.dump(mapping,open(MAPPING,'w',encoding='utf-8'),ensure_ascii=False,indent=2)
print('mapping saved',flush=True)

def walk_apply(o):
    if isinstance(o,dict):
        for k in list(o.keys()):
            v=o[k]
            if k in ('title','text','prompt') and isinstance(v,str):
                o[k]=mapping.get(v,v)
            elif k=='options' and isinstance(v,list):
                o[k]=[mapping.get(item,item) if isinstance(item,str) else item for item in v]
            else:
                walk_apply(v)
    elif isinstance(o,list):
        for item in o:
            walk_apply(item)
walk_apply(data)

out_text=json.dumps(data,ensure_ascii=False,indent=2)
out_text=out_text.replace('\n','\r\n')
open(OUT,'w',encoding='utf-8',newline='').write(out_text)
print('written',OUT,flush=True)
PY