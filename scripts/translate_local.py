import json, os, sys, time
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM

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

mapping={}
if os.path.exists(MAPPING):
    mapping=json.load(open(MAPPING,encoding='utf-8'))

tok=AutoTokenizer.from_pretrained('Helsinki-NLP/opus-mt-es-fr')
model=AutoModelForSeq2SeqLM.from_pretrained('Helsinki-NLP/opus-mt-es-fr')

def translate_batch(strs):
    # translate list of strings
    inputs=tok(strs, return_tensors='pt', padding=True, truncation=True, max_length=512)
    out=model.generate(**inputs, max_length=512)
    return [tok.decode(o, skip_special_tokens=True) for o in out]

missing=[s for s in texts if s not in mapping]
print('total',len(texts),'missing',len(missing),flush=True)

# handle non-lowercase
for s in list(missing):
    if not has_lowercase(s):
        mapping[s]=s
        missing.remove(s)

# batch translate
batch_size=8
i=0
while i < len(missing):
    batch=missing[i:i+batch_size]
    try:
        res=translate_batch(batch)
        for s,r in zip(batch,res):
            mapping[s]=r
        i+=len(batch)
        print(i,'/',len(missing),flush=True)
    except Exception as e:
        print('ERR batch',e,flush=True)
        # fallback one by one
        for s in batch:
            try:
                res=translate_batch([s])
                mapping[s]=res[0]
            except Exception as e2:
                print('ERR one',repr(s),e2,flush=True)
                mapping[s]=s
        i+=len(batch)
    if i%24==0:
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