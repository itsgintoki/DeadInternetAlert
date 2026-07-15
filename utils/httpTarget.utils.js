import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import axios from 'axios';

function isPrivateIpv4(address) {
  const [a, b] = address.split('.').map(Number);
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168 || b === 88)) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) ||
    (a === 203 && b === 0) ||
    a >= 224
  );
}

export function isPublicIp(address) {
  const family = net.isIP(address);
  if (family === 4) return !isPrivateIpv4(address);
  if (family === 6) {
    const normalized = address.toLowerCase();
    if (normalized.startsWith('::ffff:')) return isPublicIp(normalized.slice(7));
    return normalized !== '::1' && normalized !== '::' &&
      !normalized.startsWith('fc') && !normalized.startsWith('fd') &&
      !/^fe[89ab]/.test(normalized) && !normalized.startsWith('ff');
  }
  return false;
}

function lookupAll(hostname) {
  return new Promise((resolve, reject) => {
    dns.lookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
      if (error) reject(error);
      else resolve(addresses);
    });
  });
}

export async function normalizeHttpTarget(value) {
  if (typeof value !== 'string' || value.length > 2_048) {
    throw Object.assign(new Error('target must be a URL no longer than 2048 characters'), { status: 400 });
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw Object.assign(new Error('target must be a valid absolute URL'), { status: 400 });
  }

  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw Object.assign(new Error('target must be an http or https URL without credentials'), { status: 400 });
  }

  const hostname = url.hostname;
  if (net.isIP(hostname)) {
    if (!isPublicIp(hostname)) {
      throw Object.assign(new Error('target must not resolve to a private or local address'), { status: 400 });
    }
  } else {
    let addresses;
    try {
      addresses = await lookupAll(hostname);
    } catch {
      throw Object.assign(new Error('target hostname could not be resolved'), { status: 400 });
    }
    if (!addresses.length || addresses.some(({ address }) => !isPublicIp(address))) {
      throw Object.assign(new Error('target must not resolve to a private or local address'), { status: 400 });
    }
  }

  url.hash = '';
  return url.toString();
}

function safeLookup(hostname, _options, callback) {
  lookupAll(hostname)
    .then((addresses) => {
      const publicAddress = addresses.find(({ address }) => isPublicIp(address));
      if (!publicAddress) return callback(new Error('Refusing to connect to a private or local address'));
      callback(null, publicAddress.address, publicAddress.family);
    })
    .catch(callback);
}

const httpAgent = new http.Agent({ lookup: safeLookup });
const httpsAgent = new https.Agent({ lookup: safeLookup });

export async function requestUrlStatus(target, method = 'HEAD') {
  const response = await axios({
    url: target,
    method,
    timeout: 5_000,
    maxRedirects: 0,
    validateStatus: () => true,
    httpAgent,
    httpsAgent,
    responseType: method === 'GET' ? 'stream' : 'text',
    headers: method === 'GET' ? { Range: 'bytes=0-0' } : undefined,
  });

  response.data?.destroy?.();
  return response.status;
}
