import { formatIpAddress } from '../../../presentation/utils/ipFormatter';

describe('formatIpAddress', () => {
  it('returns empty string for empty input', () => {
    expect(formatIpAddress('')).toBe('');
  });

  it('keeps 1 or 2 digits without dot', () => {
    expect(formatIpAddress('1')).toBe('1');
    expect(formatIpAddress('19')).toBe('19');
  });

  it('automatically adds a dot after 3 digits', () => {
    expect(formatIpAddress('192')).toBe('192.');
    expect(formatIpAddress('192.168')).toBe('192.168.');
  });

  it('does not add a trailing dot after 3 digits in the 4th octet', () => {
    expect(formatIpAddress('192.168.1.139')).toBe('192.168.1.139');
  });

  it('converts spaces, commas, and semicolons into dots', () => {
    expect(formatIpAddress('192.168.1 ')).toBe('192.168.1.');
    expect(formatIpAddress('192,168,1,50')).toBe('192.168.1.50');
    expect(formatIpAddress('10;0;0;1')).toBe('10.0.0.1');
  });

  it('prevents duplicate consecutive dots', () => {
    expect(formatIpAddress('192..16')).toBe('192.16');
    expect(formatIpAddress('192...')).toBe('192.');
  });

  it('respects user backspacing and allows deleting dots', () => {
    // User had "192." and tapped backspace -> "192"
    expect(formatIpAddress('192', '192.')).toBe('192');

    // User had "192.168." and tapped backspace -> "192.168"
    expect(formatIpAddress('192.168', '192.168.')).toBe('192.168');

    // User had "192.168" and tapped backspace -> "192.16"
    expect(formatIpAddress('192.16', '192.168')).toBe('192.16');
  });

  it('limits octets to max 3 digits by pushing extras into next octet when continuous numbers typed', () => {
    expect(formatIpAddress('1921681139')).toBe('192.168.113.9');
  });

  it('preserves user typed single digit octets with manual dots', () => {
    expect(formatIpAddress('10.0.0.1')).toBe('10.0.0.1');
    expect(formatIpAddress('192.168.1.')).toBe('192.168.1.');
  });
});
