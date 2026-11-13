#!/usr/bin/env python3
"""Turns pending files-mode requests into prompts a model can answer.

For every Claude request without an answer it writes, next to the request:
  <kind>_<key>.user.md     the user message
  <kind>_<key>.schema.json the tool input schema
and the shared system prompt as $W/sys_<kind>.md. Pending image requests are
listed as ready-to-send JSON in $W/image_batch.json (Higgsfield / OpenAI params).
Usage: python3 eval/prep.py   (EVAL_WORK overrides the work dir)"""
import json, glob, os
D = os.path.dirname(os.path.abspath(__file__)); W = os.environ.get('EVAL_WORK', D + '/work')
for d in sorted(glob.glob(W + '/claude-*')):
    for f in sorted(glob.glob(d + '/requests/*.json')):
        name = os.path.basename(f)[:-5]
        if name.endswith('.schema') or os.path.exists(f'{d}/{name}.json'): continue
        r = json.load(open(f))
        if 'system' not in r: continue
        kind = name.split('_')[0]
        open(f'{W}/sys_{kind}.md', 'w').write('\n\n=====\n\n'.join(r['system']))
        if kind == 'deck':
            h = r['header']
            user = f"PRESENTATION: {h.get('presentation_title','')}\nREGISTER HINT (from the outline): {h.get('register') or ''}\nTHEME HINT: {h.get('theme') or ''}\n\nOUTLINE:\n{r['outline']}\n\nORIGINAL BRIEF:\n{r['brief']}"
            schema = r['tool']['input_schema']
        else:
            user = r['user_message']; schema = r['input_schema']
        open(f'{d}/requests/{name}.user.md', 'w').write(user)
        open(f'{d}/requests/{name}.schema.json', 'w').write(json.dumps(schema, indent=1))
        print('claude', kind, f'{d}/{name}.json')
batch = []
for f in sorted(glob.glob(W + '/img/requests/*.json'), key=os.path.getmtime):
    r = json.load(open(f))
    if os.path.exists(f"{W}/img/{r['key']}.png"): continue
    p = {'model': 'gpt_image_2_6_flare', 'quality': 'medium', 'resolution': '2k', 'size': r['size'], 'output_format': 'png', 'prompt': r['prompt']}
    if r['transparent']: p['background'] = 'transparent'
    batch.append({'index': len(batch), 'key': r['key'], 'label': r['label'], 'params': p})
json.dump(batch, open(W + '/image_batch.json', 'w'))
print('images pending:', len(batch), '->', W + '/image_batch.json  (save each result as img/<key>.png)')
