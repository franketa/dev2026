import json, os, base64, sys

data_file = sys.argv[1]
with open(data_file, 'r', encoding='utf-8') as f:
    files = json.load(f)

for fpath, content_b64 in files.items():
    os.makedirs(os.path.dirname(fpath), exist_ok=True)
    content = base64.b64decode(content_b64).decode('utf-8')
    with open(fpath, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f'Written {fpath}: {len(content)} bytes')
