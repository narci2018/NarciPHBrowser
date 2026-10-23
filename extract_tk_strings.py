import re

with open(r'c:\Tools2\fingerBrowsers2\NarciPHBrowser\发布鸭.exe_extracted\service\upload\tiktok_upload.cp312-win_amd64.pyd', 'rb') as f:
    data = f.read()

# Extract ASCII strings >= 4 chars
strings = re.findall(b'[\x20-\x7e]{4,}', data)
decoded = [s.decode('latin-1') for s in strings]

print(f"Total strings found: {len(decoded)}")
# Filter interesting strings related to playwright / selectors / urls / actions
interesting = [s for s in decoded if any(k in s.lower() for k in ['button', 'dialog', 'click', 'post', 'upload', 'draft', 'input', 'content', 'tiktok', 'selector', 'wait', 'role', 'text'])]
for s in interesting:
    print(s)
