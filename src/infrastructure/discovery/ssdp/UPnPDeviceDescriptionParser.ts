export interface UPnPDeviceInfo {
  friendlyName?: string;
  manufacturer?: string;
  modelName?: string;
  modelNumber?: string;
}

/**
 * Safely extracts basic device description metadata from UPnP XML.
 * Uses bounded regex scanning to avoid XML external entity (XXE) and billion-laughs vulnerabilities.
 */
export function parseUPnPDeviceXml(xml: string): UPnPDeviceInfo {
  if (!xml || typeof xml !== 'string') {
    return {};
  }

  const extractTag = (tag: string): string | undefined => {
    // Non-greedy tag content matching, strips CDATA if present
    const regex = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?<\\/${tag}>`, 'i');
    const match = regex.exec(xml);
    if (!match) return undefined;
    const value = match[1].trim();
    return value.length > 0 ? value : undefined;
  };

  return {
    friendlyName: extractTag('friendlyName'),
    manufacturer: extractTag('manufacturer'),
    modelName: extractTag('modelName'),
    modelNumber: extractTag('modelNumber'),
  };
}
