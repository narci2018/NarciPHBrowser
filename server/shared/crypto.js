// Web Crypto API 跨平台实现 (完全兼容 Cloudflare Workers, Pages 及 Node.js 18+)
export async function hashPassword(password, saltHex) {
    const salt = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16));
    const encoder = new TextEncoder();
    const passwordKey = await crypto.subtle.importKey('raw', encoder.encode(password), { name: 'PBKDF2' }, false, ['deriveBits', 'deriveKey']);
    const derivedKey = await crypto.subtle.deriveBits({
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256',
    }, passwordKey, 256);
    return {
        hash: bytesToHex(new Uint8Array(derivedKey)),
        salt: bytesToHex(salt),
    };
}
export async function verifyPassword(password, expectedHash, saltHex) {
    const { hash } = await hashPassword(password, saltHex);
    return hash === expectedHash;
}
// 简易安全 JWT 实现 (基于 Web Crypto HMAC-SHA256)
export async function signJwt(payload, secretKey) {
    const header = { alg: 'HS256', typ: 'JWT' };
    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    const data = `${encodedHeader}.${encodedPayload}`;
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secretKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
    const encodedSignature = base64UrlEncode(new Uint8Array(signature));
    return `${data}.${encodedSignature}`;
}
export async function verifyJwt(token, secretKey) {
    const parts = token.split('.');
    if (parts.length !== 3)
        return null;
    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const data = `${encodedHeader}.${encodedPayload}`;
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secretKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const signature = base64UrlDecodeToBytes(encodedSignature);
    const isValid = await crypto.subtle.verify('HMAC', key, signature, new TextEncoder().encode(data));
    if (!isValid)
        return null;
    try {
        const payload = JSON.parse(base64UrlDecodeToString(encodedPayload));
        if (payload.exp && Date.now() / 1000 > payload.exp) {
            return null; // Expired
        }
        return payload;
    }
    catch {
        return null;
    }
}
// 辅助工具函数
function bytesToHex(bytes) {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}
function hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes;
}
function base64UrlEncode(input) {
    let base64 = '';
    if (typeof input === 'string') {
        const bytes = new TextEncoder().encode(input);
        base64 = btoa(String.fromCharCode(...bytes));
    }
    else {
        base64 = btoa(String.fromCharCode(...input));
    }
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function base64UrlDecodeToString(str) {
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
        base64 += '=';
    }
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
}
function base64UrlDecodeToBytes(str) {
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
        base64 += '=';
    }
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}
