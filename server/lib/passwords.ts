import { randomInt } from 'node:crypto'

/** Readable fallback password for staff account creation and password reset.

 * This is only a prompt fallback for the admin when they do not enter a
 * password themselves. Supabase Auth enforces its own minimum length and
 * complexity rules (configured per project), so this function intentionally
 * does not impose the old 10-character / uppercase / lowercase / number /
 * symbol policy that belonged to the removed custom validation.
 */
export function generateTempPassword(length = 14): string {
  const all = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*'
  const chars: string[] = []
  for (let i = 0; i < length; i += 1) {
    chars.push(all[randomInt(all.length)])
  }
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}
