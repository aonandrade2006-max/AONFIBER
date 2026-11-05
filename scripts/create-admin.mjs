#!/usr/bin/env node
/**
 * Create the first AON FIBER administrator.
 *
 * Credentials are never stored in the repository: the password is generated
 * (or supplied) at runtime and printed once.
 *
 *   node scripts/create-admin.mjs --email admin@aonfiber.example --name "AON Admin"
 *   node scripts/create-admin.mjs --email admin@aonfiber.example --name "AON Admin" --password "..."
 */
import 'dotenv/config'
import { randomInt } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const args = process.argv.slice(2)
function arg(name, fallback = '') {
  const index = args.indexOf(`--${name}`)
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback
}

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const email = (arg('email') || '').trim().toLowerCase()
const fullName = arg('name', 'AON FIBER Administrator').trim()

if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env first.')
  process.exit(1)
}
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Provide a valid --email address.')
  process.exit(1)
}

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const LOWER = 'abcdefghijkmnopqrstuvwxyz'
const DIGITS = '23456789'
const SYMBOLS = '!@#$%&*'
const ALL = UPPER + LOWER + DIGITS + SYMBOLS

function generatePassword(length = 18) {
  const chars = [
    UPPER[randomInt(UPPER.length)],
    LOWER[randomInt(LOWER.length)],
    DIGITS[randomInt(DIGITS.length)],
    SYMBOLS[randomInt(SYMBOLS.length)],
  ]
  while (chars.length < length) chars.push(ALL[randomInt(ALL.length)])
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

const password = arg('password') || generatePassword()
if (password.length < 10) {
  console.error('Password must be at least 10 characters.')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })

async function findUserByEmail(target) {
  let page = 1
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const match = data.users.find((user) => user.email?.toLowerCase() === target)
    if (match) return match
    if (data.users.length < 200) return null
    page += 1
  }
}

async function main() {
  let user = await findUserByEmail(email)

  if (user) {
    console.log(`Auth user ${email} already exists – updating password and promoting to admin.`)
    const { error } = await supabase.auth.admin.updateUserById(user.id, {
      password,
      email_confirm: true,
      ban_duration: 'none',
      app_metadata: { role: 'admin' },
    })
    if (error) throw error
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
      app_metadata: { role: 'admin' },
    })
    if (error) throw error
    user = data.user
    if (!user) throw new Error('Supabase did not return the created user.')
  }

  const { error: profileError } = await supabase.from('profiles').upsert(
    {
      id: user.id,
      full_name: fullName,
      email,
      role: 'admin',
      branch_id: null,
      status: 'active',
      can_create_employees: true,
    },
    { onConflict: 'id' },
  )
  if (profileError) throw profileError

  console.log('\n✓ Administrator ready')
  console.log('─'.repeat(52))
  console.log(`Email:    ${email}`)
  console.log(`Password: ${password}`)
  console.log('─'.repeat(52))
  console.log('Sign in at /staff/login. Change this password after first login.')
  console.log('This password was generated locally and is not stored by the app.\n')
}

main().catch((error) => {
  console.error('Could not create the administrator:', error.message ?? error)
  process.exit(1)
})
