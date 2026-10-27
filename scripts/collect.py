import json
data=json.load(open('data/lessons.json',encoding='utf-8'))
texts=set()
def walk(o):
    if isinstance(o,dict):
        for k,v in o.items():
            if k in ('title','text','prompt') and isinstance(v,str):
                texts.add(v)
            elif k=='options' and isinstance(v,list):
                for item in v:
                    if isinstance(item,str): texts.add(item)
            else:
                walk(v)
    elif isinstance(o,list):
        for item in o:
            walk(item)
walk(data)
print('unique strings:',len(texts))
print('total chars:',sum(len(s) for s in texts))
# save
import os
os.makedirs('scripts',exist_ok=True)
with open('scripts/unique.txt','w',encoding='utf-8') as f:
    for s in sorted(texts):
        f.write(s+'\n')