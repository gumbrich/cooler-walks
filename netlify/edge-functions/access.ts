/** All website paths pass through this server-side gate, before Netlify's asset cache.
 * Secrets are project environment variables, never VITE_* values or checked-in files. */
declare const Netlify: { env: { get(name: string): string | undefined } };
type Context = { next(): Promise<Response> };
const COOKIE = '__Host-cw_access';
const SESSION_SECONDS = 7 * 24 * 60 * 60;
const encoder = new TextEncoder();
const encode = (bytes: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
const decode = (text: string) =>
  Uint8Array.from(atob(text.replaceAll('-', '+').replaceAll('_', '/')), (c) => c.charCodeAt(0));
const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
const safePath = (path: string) =>
  path.startsWith('/') && !path.startsWith('//') && !/[\\\r\n]/.test(path) ? path : '/';
const privateHeaders = {
  'Cache-Control': 'private, no-store',
  'CDN-Cache-Control': 'no-store',
  'Netlify-CDN-Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'X-Content-Type-Options': 'nosniff',
  // Same-origin form POSTs need a non-null Origin for the strict CSRF check.
  // Cross-origin requests still omit the referrer.
  'Referrer-Policy': 'same-origin',
};
function page(path: string, german: boolean, invalid = false, status = 401) {
  const title = german ? 'Zugang für Testpersonen' : 'Access for testers';
  return new Response(
    `<!doctype html><html lang="${german ? 'de' : 'en'}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cooler Walks · ${title}</title>
<style>*{box-sizing:border-box}body{margin:0;min-height:100svh;display:grid;place-items:center;background:#f5f2e9;color:#173e32;font:17px/1.5 system-ui,sans-serif;padding:24px}main{width:min(100%,380px)}.brand{font-size:25px;font-weight:750;letter-spacing:-1px}h1{font-size:21px;font-weight:550;margin:38px 0 8px}p{color:#52675d;margin:0 0 24px}label{display:block;font-weight:600;font-size:14px;margin-bottom:8px}input,button{width:100%;font:inherit;min-height:50px;border-radius:9px}input{border:1px solid #788d7f;background:#fffefa;padding:10px 14px;color:inherit}button{margin-top:16px;border:0;background:#174d39;color:white;font-weight:650;cursor:pointer}input:focus-visible,button:focus-visible,a:focus-visible{outline:3px solid #ad7313;outline-offset:3px}.error{margin:12px 0 0;color:#933b2a}a{color:inherit;font-size:14px}footer{margin-top:32px}</style>
<main><div class="brand">Cooler Walks</div><h1>${title}</h1><p>${german ? 'Bitte gib das gemeinsame Passwort ein.' : 'Enter the shared password to continue.'}</p>
<form method="post" action="/_access"><input type="hidden" name="next" value="${escape(path)}"><input type="hidden" name="language" value="${german ? 'de' : 'en'}"><label for="password">${german ? 'Passwort' : 'Password'}</label><input id="password" type="password" name="password" required maxlength="256" autocomplete="current-password"${invalid ? ' aria-describedby="error" aria-invalid="true"' : ''}>${invalid ? `<p id="error" class="error" role="alert">${german ? 'Das Passwort stimmt nicht.' : 'That password is incorrect.'}</p>` : ''}<button>${german ? 'Öffnen' : 'Continue'}</button></form><footer><a href="/_access?next=${encodeURIComponent(path)}&language=${german ? 'en' : 'de'}" lang="${german ? 'en' : 'de'}">${german ? 'English' : 'Deutsch'}</a></footer></main></html>`,
    {
      status,
      headers: {
        ...privateHeaders,
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy':
          "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      },
    },
  );
}
export async function gate(
  request: Request,
  context: Context,
  password?: string,
  signingSecret?: string,
) {
  const url = new URL(request.url);
  // A private deployment fails closed if its configuration is absent or incomplete.
  if (!password || !signingSecret || signingSecret.length < 32)
    return new Response('Private testing · access is being configured.', {
      status: 503,
      headers: privateHeaders,
    });
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(signingSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
  // Bind sessions to both this hostname and the current password. Rotating either secret revokes them.
  const revision = encode(await crypto.subtle.digest('SHA-256', encoder.encode(password)));
  const message = (expires: string) => encoder.encode(`${url.host}\n${revision}\n${expires}`);
  const cookie = request.headers
    .get('cookie')
    ?.split(';')
    .map((x) => x.trim())
    .find((x) => x.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
  let allowed = false;
  if (cookie) {
    try {
      const [expires, signature, extra] = cookie.split('.');
      allowed =
        !extra &&
        /^\d+$/.test(expires) &&
        Number(expires) > Date.now() / 1000 &&
        Number(expires) <= Date.now() / 1000 + SESSION_SECONDS + 60 &&
        (await crypto.subtle.verify('HMAC', key, decode(signature), message(expires)));
    } catch {
      /* Malformed cookies have no authority. */
    }
  }
  if (url.pathname === '/_access' && request.method === 'POST') {
    if (
      request.headers.get('origin') !== url.origin ||
      Number(request.headers.get('content-length') ?? 0) > 2048
    )
      return new Response('Forbidden', { status: 403, headers: privateHeaders });
    if (
      !(request.headers.get('content-type') ?? '').startsWith('application/x-www-form-urlencoded')
    )
      return new Response('Unsupported form', { status: 415, headers: privateHeaders });
    const body = await request.text();
    if (body.length > 2048)
      return new Response('Form too large', { status: 413, headers: privateHeaders });
    const form = new URLSearchParams(body),
      path = safePath(form.get('next') ?? '/');
    const submitted = form.get('password') ?? '';
    const expected = await crypto.subtle.sign('HMAC', key, encoder.encode(password));
    const correct =
      submitted.length <= 256 &&
      (await crypto.subtle.verify('HMAC', key, expected, encoder.encode(submitted)));
    if (!correct) return page(path, form.get('language') === 'de', true);
    const expires = String(Math.floor(Date.now() / 1000) + SESSION_SECONDS);
    const signature = encode(await crypto.subtle.sign('HMAC', key, message(expires)));
    return new Response(null, {
      status: 303,
      headers: {
        ...privateHeaders,
        Location: path,
        'Set-Cookie': `${COOKIE}=${expires}.${signature}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_SECONDS}`,
      },
    });
  }
  if (url.pathname === '/_access/logout' && request.method === 'POST') {
    if (request.headers.get('origin') !== url.origin)
      return new Response('Forbidden', { status: 403, headers: privateHeaders });
    return new Response(null, {
      status: 303,
      headers: {
        ...privateHeaders,
        Location: '/_access',
        'Set-Cookie': `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
        'Clear-Site-Data': '"cache", "storage"',
      },
    });
  }
  if (!allowed || url.pathname === '/_access') {
    const path = safePath(
      url.pathname === '/_access'
        ? (url.searchParams.get('next') ?? '/')
        : url.pathname + url.search,
    );
    const german =
      url.searchParams.get('language') === 'de' ||
      (!url.searchParams.has('language') &&
        (path.startsWith('/de/') ||
          (request.headers.get('accept-language') ?? '').startsWith('de')));
    if (
      request.method === 'GET' &&
      (url.pathname === '/_access' || request.headers.get('accept')?.includes('text/html'))
    )
      return page(path, german);
    return new Response(
      request.method === 'HEAD'
        ? null
        : 'Password required. Open this website in your browser to sign in.',
      { status: 401, headers: { ...privateHeaders, 'Content-Type': 'text/plain; charset=utf-8' } },
    );
  }
  const response = await context.next();
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(privateHeaders)) headers.set(name, value);
  headers.set('X-CW-Private', '1');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
export default (request: Request, context: Context) =>
  gate(request, context, Netlify.env.get('CW_SITE_PASSWORD'), Netlify.env.get('CW_SESSION_SECRET'));
