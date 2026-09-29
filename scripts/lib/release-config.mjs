import fs from 'node:fs';

export const readSiteConfig = () => JSON.parse(fs.readFileSync('release/site.json', 'utf8'));
export const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
export function httpsUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
      !url.hostname.endsWith('.example') &&
      url.hostname !== 'example.com'
    );
  } catch {
    return false;
  }
}
export function siteProblems(config) {
  const problems = [];
  if (!httpsUrl(config.siteUrl) || new URL(config.siteUrl).pathname !== '/')
    problems.push('Set siteUrl to the owned HTTPS website origin in release/site.json.');
  if (!config.publisherName?.trim()) problems.push('Add the public publisher name.');
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(config.supportEmail ?? ''))
    problems.push('Add a working public support email.');
  if (!config.hostingProvider?.trim() || !httpsUrl(config.hostingPrivacyUrl))
    problems.push('Identify the actual website/data host and its privacy notice.');
  if (!config.hostingDetails?.trim())
    problems.push('Describe the confirmed host request-log retention and analytics settings.');
  return problems;
}
export function publicPageHtml(html, filename, config = readSiteConfig()) {
  const draft =
    siteProblems(config).length > 0 ||
    (process.env.CONTEXT && process.env.CONTEXT !== 'production');
  const german = /[\/]de[\/]/.test(filename);
  const route =
    (german ? '/de' : '') +
    (filename.includes('/privacy/')
      ? '/privacy/'
      : filename.includes('/support/')
        ? '/support/'
        : '/');
  const contact =
    config.supportEmail && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(config.supportEmail)
      ? `<a href="mailto:${escapeHtml(config.supportEmail)}">${escapeHtml(config.supportEmail)}</a>`
      : 'Support contact will be published before launch.';
  const host =
    config.hostingProvider && httpsUrl(config.hostingPrivacyUrl)
      ? `<a href="${escapeHtml(config.hostingPrivacyUrl)}" rel="noreferrer">${escapeHtml(config.hostingProvider)} ${german ? 'Datenschutzhinweise' : 'privacy notice'}</a>`
      : 'The hosting provider will be identified here before launch.';
  return html
    .replace(
      '<!--CW:META-->',
      draft
        ? '<meta name="robots" content="noindex, nofollow" />'
        : `<link rel="canonical" href="${escapeHtml(new URL(route, config.siteUrl).href)}" /><link rel="alternate" hreflang="en" href="${escapeHtml(new URL(route.replace(/^\/de/, '') || '/', config.siteUrl).href)}" /><link rel="alternate" hreflang="de" href="${escapeHtml(new URL('/de' + (route.replace(/^\/de/, '') || '/'), config.siteUrl).href)}" />`,
    )
    .replaceAll(
      '<!--CW:DRAFT-->',
      draft
        ? '<aside class="notice">Release preview · Publisher and hosting details are pending. This page is a draft.</aside>'
        : '',
    )
    .replaceAll(
      '<!--CW:PUBLISHER-->',
      escapeHtml(config.publisherName || 'Publisher details pending'),
    )
    .replaceAll('<!--CW:CONTACT-->', contact)
    .replaceAll('<!--CW:HOST-->', host)
    .replaceAll(
      '<!--CW:HOST-DETAILS-->',
      escapeHtml(
        (german ? config.hostingDetailsDe : config.hostingDetails) ||
          'Hosting retention and any provider analytics must be confirmed before publication.',
      ),
    );
}
