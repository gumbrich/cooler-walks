/** Optional test authentication. Supply CW_SITE_PASSWORD through an ignored env file,
 * never command-line arguments. The returned cookie must not be logged or committed. */
export async function siteAccess(origin) {
  if (!process.env.CW_SITE_PASSWORD) return null;
  const url = new URL(origin);
  if (url.protocol !== 'https:') throw new Error('Test access credentials require HTTPS.');
  const response = await fetch(new URL('/_access', url), {
    method: 'POST',
    redirect: 'manual',
    headers: { Origin: url.origin, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ password: process.env.CW_SITE_PASSWORD, next: '/' }),
  });
  const cookie = response.headers.get('set-cookie')?.split(';')[0];
  if (response.status !== 303 || !cookie?.startsWith('__Host-cw_access='))
    throw new Error(`Website test sign-in failed (${response.status}).`);
  return cookie;
}
export async function authorizeBrowser(context, origin) {
  const cookie = await siteAccess(origin);
  if (cookie)
    await context.addCookies([
      {
        name: '__Host-cw_access',
        value: cookie.slice(cookie.indexOf('=') + 1),
        url: new URL(origin).origin,
        secure: true,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
}
