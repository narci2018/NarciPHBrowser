import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import fs from 'node:fs';

function fetchViaProxy(targetUrl) {
  return new Promise((resolve, reject) => {
    const u = new URL(targetUrl);
    const req = http.request({
      host: '127.0.0.1',
      port: 10808,
      method: 'CONNECT',
      path: `${u.hostname}:443`,
    });

    req.on('connect', (res, socket) => {
      const tlsSocket = tls.connect({ host: u.hostname, socket, servername: u.hostname }, () => {
        const httpsReq = https.request({
          host: u.hostname,
          path: u.pathname,
          headers: { 'Host': u.hostname, 'User-Agent': 'clash-verge/v1.7.7' },
          createConnection: () => tlsSocket,
        }, (httpsRes) => {
          let body = '';
          httpsRes.on('data', c => body += c);
          httpsRes.on('end', () => resolve(body));
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

const body = await fetchViaProxy('https://raw.githubusercontent.com/Pawdroid/Free-servers/main/sub');
fs.writeFileSync('pawdroid_sub.txt', body);
console.log('Saved pawdroid_sub.txt, len:', body.length);
