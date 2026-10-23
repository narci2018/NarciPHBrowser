import http from 'node:http';

const req = http.request({
  host: '127.0.0.1',
  port: 10808,
  method: 'GET',
  path: 'http://www.vpngate.net/api/iphone/',
  headers: {
    'Host': 'www.vpngate.net',
    'User-Agent': 'Mozilla/5.0'
  }
}, (res) => {
  console.log('Status code:', res.statusCode);
  let data = '';
  res.on('data', chunk => { data += chunk; });
  res.on('end', () => {
    console.log('Received bytes:', data.length);
    const lines = data.split('\n');
    const valid = lines.filter(l => l.startsWith('public-vpn-'));
    console.log('Public VPN servers:', valid.length);
    if (valid.length > 0) {
      console.log('First server:', valid[0].slice(0, 80));
    }
  });
});

req.on('error', (err) => {
  console.error('Proxy request error:', err.message);
});

req.end();
