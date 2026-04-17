/**
 * Extracts a 5-digit JIS municipality code from various code formats.
 * Accepts 5-digit codes directly (e.g. "33101") or longer codes where
 * the first 5 digits are the municipality portion (e.g. 11-digit district
 * key_code "33101001001").
 */
export function extractMunicipalityCode(code: string | null | undefined): string | null {
  if (!code) return null
  const digits = String(code).replace(/\D/g, '')
  if (digits.length < 5) return null
  return digits.slice(0, 5)
}
