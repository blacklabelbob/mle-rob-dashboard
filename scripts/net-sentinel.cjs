/**
 * net-sentinel — a preload module that records every attempt to reach the
 * network off this machine. Loaded via NODE_OPTIONS=--require so it also
 * covers the child processes `next dev` forks.
 *
 * It RECORDS, it does not block: a demo run that quietly falls back after a
 * failed connection would still be a demo run that made a network call, and
 * the DoD says zero. Blocking would hide exactly what we are measuring.
 *
 * Every outbound socket in Node — including undici/global fetch, the Supabase
 * client, and the Anthropic SDK — bottoms out in net.Socket#connect, so that
 * is the choke point. DNS is wrapped too: a resolution attempt is a network
 * call even when no socket follows it.
 */
const net = require('net');
const dns = require('dns');
const fs = require('fs');

const LOG = process.env.NET_SENTINEL_LOG;
if (!LOG) throw new Error('net-sentinel: NET_SENTINEL_LOG must name a file to append findings to');

const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '::ffff:127.0.0.1', '0.0.0.0', '']);

function isLocal(host) {
  if (host == null) return true;
  const h = String(host).toLowerCase();
  return LOOPBACK.has(h) || h.endsWith('.localhost') || h.startsWith('127.');
}

function record(kind, target) {
  if (isLocal(target)) return;
  try {
    fs.appendFileSync(LOG, `${kind}\t${target}\t${new Error().stack.split('\n').slice(3, 6).join(' | ')}\n`);
  } catch {
    // A sentinel that throws inside the process it watches would be worse than
    // one that misses a line; the assertion lives in the runner, not here.
  }
}

const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function connect(...args) {
  const [first, second] = args;
  let host;
  if (typeof first === 'object' && first !== null) {
    // A unix-domain socket ({ path }) never leaves the machine.
    host = first.path ? null : first.host;
  } else if (typeof second === 'string') {
    host = second; // connect(port, host, cb)
  } else {
    host = null; // connect(port) / connect(path) → loopback or IPC
  }
  record('connect', host);
  return originalConnect.apply(this, args);
};

for (const name of ['lookup', 'resolve', 'resolve4', 'resolve6']) {
  const original = dns[name];
  if (typeof original !== 'function') continue;
  dns[name] = function wrapped(hostname, ...rest) {
    record(`dns.${name}`, hostname);
    return original.call(this, hostname, ...rest);
  };
  const originalPromise = dns.promises?.[name];
  if (typeof originalPromise === 'function') {
    dns.promises[name] = function wrappedPromise(hostname, ...rest) {
      record(`dns.promises.${name}`, hostname);
      return originalPromise.call(this, hostname, ...rest);
    };
  }
}
