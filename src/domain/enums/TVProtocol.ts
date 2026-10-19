/**
 * Wire protocol used to talk to a TV. Adapter selection is driven by
 * protocol + platform, never by brand alone.
 */
export enum TVProtocol {
  LGWebOSSSAP = 'lg-webos-ssap',
  LGNetCast = 'lg-netcast',
  SamsungTizen = 'samsung-tizen',
  AndroidTVRemote = 'android-tv-remote',
  Mock = 'mock',
}
