import { isThreatened } from '@/lib/iucn';

// The website's Threatened filter uses the same three statuses (web/src/lib/iucn.ts).
describe('isThreatened', () => {
  it('says yes for Vulnerable, Endangered and Critically Endangered', () => {
    expect(isThreatened('VU')).toBe(true);
    expect(isThreatened('EN')).toBe(true);
    expect(isThreatened('CR')).toBe(true);
  });

  it('says no for every other status, including Near Threatened', () => {
    expect(isThreatened('LC')).toBe(false);
    expect(isThreatened('NT')).toBe(false);
    expect(isThreatened('DD')).toBe(false);
    expect(isThreatened('NE')).toBe(false);
  });
});
