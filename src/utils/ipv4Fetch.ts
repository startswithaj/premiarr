import https from 'https';
import dns from 'dns';

/**
 * Custom fetch that forces IPv4 to avoid IPv6 connectivity issues
 */
export function createIPv4Fetch() {
  return async function ipv4Fetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const parsed = new URL(url);

    return new Promise((resolve, reject) => {
      dns.lookup(parsed.hostname, { family: 4 }, (err, address) => {
        if (err) return reject(err);

        const reqOptions: https.RequestOptions = {
          hostname: address,
          port: 443,
          path: parsed.pathname + parsed.search,
          method: init?.method || 'GET',
          headers: {
            'Host': parsed.hostname,
            'Content-Type': 'application/json',
            ...(init?.headers as Record<string, string>)
          },
          servername: parsed.hostname
        };

        const req = https.request(reqOptions, (res) => {
          const chunks: Buffer[] = [];
          res.on('data', chunk => chunks.push(chunk));
          res.on('end', () => {
            const data = Buffer.concat(chunks).toString();
            resolve({
              ok: (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300,
              status: res.statusCode ?? 0,
              statusText: res.statusMessage ?? '',
              headers: new Headers(res.headers as Record<string, string>),
              json: async () => JSON.parse(data),
              text: async () => data,
            } as Response);
          });
        });

        req.on('error', reject);
        req.setTimeout(30000, () => { req.destroy(); reject(new Error('Request timeout')); });
        if (init?.body) req.write(init.body);
        req.end();
      });
    });
  };
}
