"""Independent structural observations, plus verbatim engine counters. No PASS inferred from HTTP alone."""
import json,pathlib,collections,re,datetime
root=pathlib.Path(__file__).parent
rows=[]
for file in sorted(root.glob('*.meta.json')):
 m=json.loads(file.read_text()); ident=m['id']
 response=root/(ident+'.response.json')
 if not response.exists():continue
 d=json.loads(response.read_text()); req=json.loads((root/(ident+'.request.json')).read_text())
 h=d.get('household') or {}; ds=d.get('dishes') or []; ps=d.get('preparations') or []; ss=d.get('cooking_sessions') or []; shopping=d.get('shopping_list') or []
 if ident=='C01-adopt-memory' and (root/'C01-after-adoption.memory.json').exists():
  archived=json.loads((root/'C01-after-adoption.memory.json').read_text())['plans']['data']
  persisted=next((x for x in archived if x['id']==(d.get('meal') or {}).get('id')),None)
  if persisted:h=persisted.get('generated_from',{}).get('household',h)
 fixture=json.loads((root/(ident+'.fixture.json')).read_text()); roster=fixture.get('roster') or []
 usage=json.loads((root/(ident+'.usage.json')).read_text()) if (root/(ident+'.usage.json')).exists() else []
 if not isinstance(usage,list):usage=[]
 pmap={p['id']:p for p in ps}; cooked={p:s.get('day') for s in ss for p in s.get('preparation_ids',[])}
 tokens=['mon','tue','wed','thu','fri','sat','sun']; win=d.get('window') or {}; start=win.get('starts_on')
 order={tokens[(datetime.date.fromisoformat(start).weekday()+i)%7]:i for i in range(win.get('duration_days',0))} if start else {}
 future_cooked=[{'dish':x.get('title'),'eaten':x.get('day'),'preparation':u.get('preparation_id'),'cooked':cooked.get(u.get('preparation_id'))} for x in ds for u in x.get('uses',[]) if order.get(cooked.get(u.get('preparation_id')),-999)>order.get(x.get('day'),999)]
 referenced={u['preparation_id'] for x in ds for u in x.get('uses',[])}|{i['preparation_id'] for x in ds for b in x.get('boxes',[]) for i in b.get('items',[]) if i.get('preparation_id')}
 counts=collections.Counter(x.get('title','') for x in ds if x.get('slot') in ['lunch','dinner'])
 minor={p['member_id'] for p in roster if p.get('age_state') in ['minor','under_18'] or (p.get('birth_date') or '1900')>'2008-09-05'}
 # Useful candidate flags; semantic ingredient review remains a separate manual step.
 doubled=[];no_boxes=[];minor_kcal=[]
 for cell in sorted({(x.get('day',''),x.get('slot','')) for x in ds}):
  cell_ds=[x for x in ds if (x.get('day'),x.get('slot'))==cell]
  named=collections.Counter(mid for x in cell_ds for b in x.get('boxes',[]) for mid in b.get('member_ids',[]))
  doubled += [{'cell':cell,'member':mid,'count':n} for mid,n in named.items() if n>1]
 for x in ds:
  if x.get('uses') and not x.get('boxes'):no_boxes.append([x.get('day'),x.get('slot'),x.get('title')])
  for b in x.get('boxes',[]):
   if set(b.get('member_ids',[])) & minor and any(v is not None for k,v in b.items() if 'kcal' in k):minor_kcal.append({'dish':x.get('title'),'box':b})
 r={'id':ident,'http':m['http'],'seconds':round(m['seconds'],1),'code_unchanged':m['before']==m['after'],'error':d.get('error'),
 'requested_days':req.get('window',{}).get('count',req.get('window',{}).get('duration_days')),'window':d.get('window'),'timing':d.get('timing'),
 'dishes':len(ds),'preparations':len(ps),'sessions':[(s.get('day'),s.get('total_minutes'),len(s.get('preparation_ids',[]))) for s in ss],
 'shopping_lines':len(shopping),'grocery_dates':sorted({x.get('buy_on') for x in shopping if x.get('buy_on')}),'freeze_on_purchase':sum(bool(x.get('freeze_on_purchase')) for x in shopping),
 'boxes':sum(len(x.get('boxes',[])) for x in ds),'cooked_without_boxes':no_boxes,'duplicate_mouths':doubled,'minor_kcal_candidates':minor_kcal,
 'unreferenced_preparations':sorted(set(pmap)-referenced),'missing_preparations':sorted(referenced-set(pmap)),'uncooked_preparations':sorted(set(pmap)-set(cooked)),'cooked_after_meal':future_cooked,
 'repeated_main_titles':dict(counts),'breakfast_titles':sorted({x.get('title') for x in ds if x.get('slot')=='breakfast'}),
 'yogurt_snack_titles':[x.get('title') for x in ds if x.get('slot') not in ['lunch','dinner'] and re.search(r'yaourt|yog[ho]?urt|skyr',x.get('title',''),re.I)],
 'explanation':d.get('explanation'),'rationale':d.get('rationale'),'request_report':d.get('request_report'),
 'engine':{k:h.get(k) for k in ['regime_belt','exclusion_belt','swap','meals_delivered','boxes_gate','box_sizing']},'issues':d.get('issues',[]),
 'llm_calls':[{'source':u.get('source'),'model':u.get('model'),'latency_ms':u.get('latency_ms'),'output_tokens':u.get('output_tokens'),'status':u.get('status')} for u in usage],
 'cost_usd_recorded':sum(u.get('cost_usd') or 0 for u in usage),'cost_verified':False}
 rows.append(r)
(root/'observations.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2))
for r in rows:
 e=r['engine']; b=e.get('box_sizing') or {}; print(r['id'],r['http'],r['seconds'],'days=',(r['window'] or {}).get('duration_days'),'dishes=',r['dishes'],'missing=',(e.get('meals_delivered') or {}).get('missing'),'unmet=',b.get('unmet_band'),'explanation=',len((r['explanation'] or {}).get('lines',[])),'swap=',(e.get('swap') or {}).get('flagrant'))
