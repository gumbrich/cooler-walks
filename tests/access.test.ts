import { describe, expect, it } from 'vitest';
import { gate } from '../netlify/edge-functions/access';

// Test-only credentials; production values live exclusively in Netlify.
const password = 'fixture-password';
const secret = 'test-only-signing-key-32-bytes-long';
const context = {
  next: async () =>
    new Response('protected asset', { headers: { 'Cache-Control': 'public, max-age=31536000' } }),
};
const request = (path: string, init?: RequestInit) =>
  new Request(`https://example.test${path}`, init);
const run = (path: string, init?: RequestInit) =>
  gate(request(path, init), context, password, secret);
async function login(next = '/de/?view=planner', candidate = password) {
  return run('/_access', {
    method: 'POST',
    headers: {
      Origin: 'https://example.test',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ password: candidate, next, language: 'de' }),
  });
}
describe('private website access', () => {
  it('protects pages, modules, map data and deployment assets, including HEAD', async () => {
    for (const path of [
      '/',
      '/de/',
      '/index.html',
      '/assets/main.js',
      '/packs/catalog.json',
      '/data/zurich.json',
      '/sw.js',
      '/.netlify/functions/example',
    ]) {
      for (const method of ['GET', 'HEAD']) {
        const response = await run(path, { method });
        expect(response.status).toBe(401);
        expect(response.headers.get('cache-control')).toContain('no-store');
        expect(await response.text()).not.toContain('protected asset');
      }
    }
  });
  it('fails closed without both server secrets', async () => {
    expect((await gate(request('/'), context)).status).toBe(503);
    expect((await gate(request('/'), context, password, 'short')).status).toBe(503);
  });
  it('has a German prompt and rejects incorrect passwords without leaking them', async () => {
    const html = await (await run('/de/', { headers: { Accept: 'text/html' } })).text();
    expect(html).toContain('lang="de"');
    expect(html).toContain('Passwort');
    const invalid = await login('/', 'wrong-test');
    expect(invalid.status).toBe(401);
    expect(invalid.headers.has('set-cookie')).toBe(false);
    expect(await invalid.text()).not.toContain(password);
  });
  it('issues a secure session and prevents shared caching after authentication', async () => {
    const response = await login();
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/de/?view=planner');
    const cookie = response.headers.get('set-cookie')!;
    for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/'])
      expect(cookie).toContain(attribute);
    const asset = await run('/data/zurich.json', { headers: { cookie } });
    expect(asset.status).toBe(200);
    expect(await asset.text()).toBe('protected asset');
    expect(asset.headers.get('cache-control')).toBe('private, no-store');
    expect(asset.headers.get('netlify-cdn-cache-control')).toBe('no-store');
  });
  it('rejects tampering, expired sessions, different hosts and rotated passwords', async () => {
    const cookie = (await login()).headers.get('set-cookie')!;
    const value = cookie.split(';')[0];
    for (const forged of [
      value + 'x',
      value.replace(/=\d+/, '=1'),
      '__Host-cw_access=invalid',
      '__Host-cw_access=99999999999.bad',
    ])
      expect((await run('/', { headers: { cookie: forged } })).status).toBe(401);
    expect(
      (
        await gate(
          new Request('https://another.test/', { headers: { cookie } }),
          context,
          password,
          secret,
        )
      ).status,
    ).toBe(401);
    expect(
      (await gate(request('/', { headers: { cookie } }), context, 'changed', secret)).status,
    ).toBe(401);
  });
  it('prevents external redirects, HTML injection and cross-origin login/logout', async () => {
    for (const path of ['https://evil.test/', '//evil.test/', '/\\evil.test', '/\nLocation:evil'])
      expect((await login(path)).headers.get('location')).toBe('/');
    const html = await (
      await run('/_access?next=%2F%22%3E%3Cscript%3E', { headers: { Accept: 'text/html' } })
    ).text();
    expect(html).not.toContain('<script>');
    for (const path of ['/_access', '/_access/logout'])
      expect(
        (await run(path, { method: 'POST', headers: { Origin: 'https://evil.test' } })).status,
      ).toBe(403);
  });
  it('clears session and browser storage on explicit logout', async () => {
    const response = await run('/_access/logout', {
      method: 'POST',
      headers: { Origin: 'https://example.test' },
    });
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
    expect(response.headers.get('clear-site-data')).toContain('storage');
  });
});
