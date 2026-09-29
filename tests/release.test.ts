import { describe, expect, it } from 'vitest';
// @ts-expect-error Shared Node build helper.
import { publicPageHtml, siteProblems, httpsUrl } from '../scripts/lib/release-config.mjs';

describe('publication boundaries', () => {
  it('keeps missing identity and host settings visibly draft and unindexed', () => {
    expect(siteProblems({})).toHaveLength(5);
    const page = publicPageHtml(
      '<!--CW:META--><!--CW:DRAFT--><!--CW:CONTACT-->',
      '/privacy/index.html',
      {},
    );
    expect(page).toContain('noindex');
    expect(page).toContain('This page is a draft');
    expect(page).not.toContain('mailto:');
  });
  it('rejects insecure and credential-bearing public origins', () => {
    for (const value of [
      'http://coolerwalks.com',
      'https://u:p@coolerwalks.com',
      'https://localhost',
      'https://maps.example',
      'https://coolerwalks.com/?token=secret',
    ])
      expect(httpsUrl(value)).toBe(false);
    expect(httpsUrl('https://coolerwalks.com/packs/')).toBe(true);
  });
  it('escapes publisher content and gives each real page its own canonical URL', () => {
    const config = {
      siteUrl: 'https://coolerwalks.com',
      publisherName: '<script>bad()</script>',
      supportEmail: 'test@coolerwalks.com',
      hostingProvider: 'Host',
      hostingPrivacyUrl: 'https://host.test/privacy',
      hostingDetails: 'No app analytics; retention confirmed by operator.',
    };
    const html = publicPageHtml('<!--CW:META--><!--CW:PUBLISHER-->', '/support/index.html', config);
    expect(html).toContain('https://coolerwalks.com/support/');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
