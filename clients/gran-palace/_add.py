
import json, base64, os, sys

B = 'C:/Users/marti/OneDrive/Desktop/dev2026/clients/gran-palace'
dp = os.path.join(B, '_data.json')

# Read existing data
with open(dp, 'r') as f:
    data = json.load(f)

# Read content from stdin
content = sys.stdin.read()
fname = sys.argv[1]

data[fname] = base64.b64encode(content.encode('utf-8')).decode('ascii')

with open(dp, 'w') as f:
    json.dump(data, f)

print(f'Added {fname}: {len(content)} bytes')
