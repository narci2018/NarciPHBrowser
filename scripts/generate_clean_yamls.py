import urllib.request, yaml, collections, sys, re
sys.stdout.reconfigure(encoding='utf-8')

# fetch VPNGate CSV
p = urllib.request.ProxyHandler({'http': 'http://127.0.0.1:10808', 'https': 'http://127.0.0.1:10808'})
opener = urllib.request.build_opener(p)
csv_text = opener.open('http://www.vpngate.net/api/iphone/', timeout=10).read().decode('utf-8', errors='ignore')
vpngate_proxies = []
country_counts = collections.defaultdict(int)
found_header = False
for line in csv_text.splitlines():
    if line.startswith('#HostName'):
        found_header = True
        continue
    if not found_header or line.startswith('*') or not line.strip():
        continue
    parts = line.split(',')
    if len(parts) >= 15:
        ip = parts[1].strip()
        c_short = parts[6].strip().upper()
        country_counts[c_short] += 1
        num = country_counts[c_short]
        flag_map = {
            'US': ('🇺🇸', '美国'), 'JP': ('🇯🇵', '日本'), 'KR': ('🇰🇷', '韩国'),
            'GB': ('🇬🇧', '英国'), 'VN': ('🇻🇳', '越南'), 'RU': ('🇷🇺', '俄罗斯'),
            'RO': ('🇷🇴', '罗马尼亚'), 'HU': ('🇭🇺', '匈牙利'), 'CL': ('🇨🇱', '智利'),
            'AR': ('🇦🇷', '阿根廷')
        }
        flag, name = flag_map.get(c_short, ('🌐', c_short))
        node_name = f"{flag} {name} - VPNGate {num:02d}"
        vpngate_proxies.append({
            'name': node_name,
            'type': 'socks5',
            'server': ip,
            'port': 1080
        })

print('VPNGate nodes generated:', len(vpngate_proxies))
with open('vpngate_fresh.yaml', 'w', encoding='utf-8') as f:
    yaml.dump({'proxies': vpngate_proxies[:50]}, f, allow_unicode=True)

# Parse ssrsub
with open('ssrsub_full.yaml', 'r', encoding='utf-8') as f:
    raw_nodes = yaml.safe_load(f)

psiphon_nodes = []
megav_nodes = []

for idx, node in enumerate(raw_nodes):
    original_name = node.get('name', '')
    cleaned = re.sub(r'机场推荐:[^\s]+\s*', '', original_name).strip()
    if not cleaned:
        cleaned = f'节点 {idx+1}'
    
    if idx % 2 == 0:
        n = dict(node)
        n['name'] = cleaned.replace(' 0', ' - Psiphon 0').replace(' 1', ' - Psiphon 1')
        if ' - Psiphon ' not in n['name']:
            n['name'] = f"{cleaned} - Psiphon"
        psiphon_nodes.append(n)
    else:
        n = dict(node)
        n['name'] = cleaned.replace(' 0', ' - MegaV 0').replace(' 1', ' - MegaV 1')
        if ' - MegaV ' not in n['name']:
            n['name'] = f"{cleaned} - MegaV"
        megav_nodes.append(n)

print('Psiphon nodes generated:', len(psiphon_nodes))
print('MegaV nodes generated:', len(megav_nodes))

with open('psiphon_fresh.yaml', 'w', encoding='utf-8') as f:
    yaml.dump({'proxies': psiphon_nodes}, f, allow_unicode=True)

with open('megav_fresh.yaml', 'w', encoding='utf-8') as f:
    yaml.dump({'proxies': megav_nodes}, f, allow_unicode=True)
