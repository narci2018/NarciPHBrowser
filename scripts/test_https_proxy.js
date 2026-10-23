import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';

function fetchViaProxy(targetUrl) {
  return new Promise((resolve, reject) => {
    const u = new URL(targetUrl);
    const req = http.request({
      host: '127.0.0.1',
      port: 10808,
      method: 'CONNECT',
      path: `${u.hostname}:${u.port || 443}`,
    });

    req.on('connect', (res, socket) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`CONNECT failed: ${res.statusCode}`));
      }
      const tlsSocket = tls.connect({
        host: u.hostname,
        socket,
        servername: u.hostname,
      }, () => {
        const httpsReq = https.request({
          host: u.hostname,
          path: u.pathname + u.search,
          headers: {
            'Host': u.hostname,
            'User-Agent': 'clash-verge/v1.7.7',
          },
          createConnection: () => tlsSocket,
        }, (httpsRes) => {
          let body = '';
          httpsRes.on('data', c => body += c);
          httpsRes.on('end', () => resolve({ status: httpsRes.statusCode, len: body.length, body }));
        });
        httpsReq.on('error', reject);
        httpsReq.end();
      });
      tlsSocket.on('error', reject);
    });

    req.on('error', reject);
    req.end();
  });
}

const urls = [
  'https://raw.githubusercontent.com/Pawdroid/Free-servers/main/sub',
  'https://raw.githubusercontent.com/alanbobs999/TopFreeProxies/master/sub/clash.yaml',
  'https://raw.githubusercontent.com/vpei/Free-Node-Merge/main/clash.yaml',
  'https://raw.githubusercontent.com/mft00/Vless-Configs/main/All_Configs_Sub.txt'
];

for (const url of urls) {
  fetchViaProxy(url)
    .then(r => console.log(url, 'Status:', r.status, 'Len:', r.len))
    .catch(e => console.error(url, 'Err:', e.message));
}
