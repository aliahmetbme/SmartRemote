/**
 * Automatically formats an IPv4 address string by inserting dots between octets
 * as the user types digits.
 *
 * Behavior:
 * - When an octet reaches 3 digits (e.g. "192"), automatically appends a dot -> "192."
 * - Converts spaces, commas, or semicolons to dots (convenient on keyboards).
 * - Prevents consecutive dots (e.g. ".." -> ".").
 * - Limits to a maximum of 4 octets and 3 digits per octet.
 * - Respects backspace/deletion: if the text length decreased, does not re-add dots.
 */
export function formatIpAddress(input: string, prev = ''): string {
  if (!input) return '';

  // If user is deleting (backspace), allow deletion without auto-inserting dots
  if (input.length < prev.length) {
    return input;
  }

  // Convert common separator keys (comma, semicolon, space) to dot
  let clean = input.replace(/[,\s;]/g, '.');

  // Prevent multiple consecutive dots
  clean = clean.replace(/\.{2,}/g, '.');

  const parts = clean.split('.');
  const formattedParts: string[] = [];

  for (let i = 0; i < parts.length && i < 4; i++) {
    let part = parts[i];

    // If an octet of digits has more than 3 digits, roll the extra into the next octet
    if (/^\d{4,}$/.test(part)) {
      if (i < 3) {
        const extra = part.slice(3);
        part = part.slice(0, 3);
        if (parts[i + 1] !== undefined) {
          parts[i + 1] = extra + parts[i + 1];
        } else {
          parts.splice(i + 1, 0, extra);
        }
      } else {
        part = part.slice(0, 3);
      }
    }

    formattedParts.push(part);
  }

  let result = formattedParts.join('.');

  // If the last part has exactly 3 digits and we haven't reached the 4th octet yet,
  // automatically append a dot.
  const lastIndex = formattedParts.length - 1;
  const lastPart = formattedParts[lastIndex];

  if (
    formattedParts.length < 4 &&
    /^\d{3}$/.test(lastPart) &&
    !clean.endsWith('.')
  ) {
    result += '.';
  }

  return result;
}
