import json, os, sys, time, urllib.request, urllib.parse, re

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

# collect protected tokens
protected=set()
# note names (Spanish) and common forms
for n in ['Do','Re','Mi','Fa','Sol','La','Si','Ré']:
    protected.add(n)
# chord symbols from data
for obj in [data]:
    pass
def collect_chords(o):
    if isinstance(o,dict):
        for k,v in o.items():
            if k in ('chord','icon') and isinstance(v,str):
                # keep chord-like tokens
                if re.fullmatch(r'[A-G][#b]?(?:m|M|maj|min|dim|aug|sus|add|dom)?[0-9]*(?:/[A-G][#b]?)?', v):
                    protected.add(v)
            else:
                collect_chords(v)
    elif isinstance(o,list):
        for item in o:
            collect_chords(item)
collect_chords(data)
# lowercase note phrases
protected.add('mi agudo')
protected.add('mi grave')
# code-like chunks
protected.add('p-i-m-a')
protected.add('p i m a')
# single letters D/U as strumming indicators
protected.add('D')
protected.add('U')

# sort by length desc
prot_sorted=sorted(protected, key=len, reverse=True)

def protect(s):
    # returns (protected_string, restore_dict)
    restore={}
    result=s
    # We'll replace tokens with placeholders using regex word boundaries for alphabetic tokens
    # Simplest: iterate tokens and replace literal occurrences with boundaries
    idx=0
    # Use a placeholder map
    ph_map={}
    def get_ph(tok):
        nonlocal idx
        if tok not in ph_map:
            ph_map[tok]='__P%d__'%idx
            idx+=1
        return ph_map[tok]
    # For multi-word/lowercase phrases, direct replace
    for tok in prot_sorted:
        if tok.isalpha() and tok.islower():
            # lowercase phrase exact
            if tok in result:
                ph=get_ph(tok)
                result=result.replace(tok, ph)
        else:
            # use regex word boundary for single tokens? For chord symbols with # etc, use boundaries
            pattern=r'(?<![A-Za-z0-9#b/])'+re.escape(tok)+r'(?![A-Za-z0-9#b/])'
            if re.search(pattern, result):
                ph=get_ph(tok)
                result=re.sub(pattern, ph, result)
    # restore mapping reverse
    rev={v:k for k,v in ph_map.items()}
    return result, rev

def translate_one(s):
    if not has_lowercase(s):
        # but still may contain protected? no need translate
        return s
    prot, rev = protect(s)
    # if no lowercase after protection? check
    if not any(c.islower() for c in prot.replace('__','').replace('P','')):
        # maybe all letters protected; but still translate? if no lowercase, skip
        pass
    q=urllib.parse.quote(prot)
    url='https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=es&tl=fr&q='+q
    for attempt in range(8):
        try:
            with urllib.request.urlopen(url,timeout=30) as r:
                res=json.loads(r.read().decode('utf-8'))
            tr=res[0] if isinstance(res,list) else str(res)
            # restore placeholders
            for ph,tok in rev.items():
                # map note names to French forms
                fr_tok=tok
                low=tok.lower()
                if low=='mi': fr_tok='Mi'
                elif low=='re': fr_tok='Ré'
                elif low=='sol': fr_tok='Sol'
                elif low=='la': fr_tok='La'
                elif low=='fa': fr_tok='Fa'
                elif low=='si': fr_tok='Si'
                elif low=='do': fr_tok='Do'
                elif tok=='mi agudo': fr_tok='Mi aigu'
                elif tok=='mi grave': fr_tok='Mi grave'
                tr=tr.replace(ph, fr_tok)
            # manual fixes
            tr=tr.replace('Accueillir!','Bienvenue !')
            tr=tr.replace('Accueillir','Bienvenue')
            return tr
        except Exception as e:
            msg=str(e)
            if '429' in msg or 'Too Many' in msg:
                wait=30*(attempt+1)
            else:
                wait=5*(attempt+1)
            sys.stdout.write('wait %ds on %r: %s\n'%(wait,s,msg)); sys.stdout.flush()
            time.sleep(wait)
    raise RuntimeError('failed: '+s)

mapping={}
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