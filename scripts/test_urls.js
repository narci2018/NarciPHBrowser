import http from 'node:http';

const testUrls = [
  'http://raw.githubusercontent.com/alanbobs999/TopFreeProxies/master/sub/clash.yaml',
  'http://raw.githubusercontent.com/vpei/Free-Node-Merge/main/clash.yaml',
  'http://raw.githubusercontent.com/mft00/Vless-Configs/main/All_Configs_Sub.txt',
  'http://raw.githubusercontent.com/ZJH233-tech/vpngate-clean-mihomo/main/clash.yaml'
];

for (const rawUrl of testUrls) {
  const u = new URL(rawUrl);
  const req = http.request({
    host: '127.0.0.1',
    port: 10808,
    method: 'GET',
    path: u.pathname,
    headers: {
      'Host': u.hostname,
      'User-Agent': 'clash-verge/v1.7.7'
    }
  }, (res) => {
    console.log(u.hostname + u.pathname, 'Status:', res.statusCode);
    let len = 0;
    res.on('data', c => len += c.length);
    res.on('end', () => console.log('Bytes:', len));
  });
  req.on('error', e => console.error(u.pathname, 'Err:', e.message));
  req.end();
}
