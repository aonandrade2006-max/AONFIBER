import express, { type NextFunction, type Request, type Response } from 'express'
import cors from 'cors'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { env, supabaseConfigured } from './env'
import { HttpError } from './lib/http'
import publicRoutes from './routes/public'
import customerAuthRoutes from './routes/customerAuth'
import staffRoutes from './routes/staff'
import adminRoutes from './routes/admin'

const app = express()

app.disable('x-powered-by')
app.set('trust proxy', 1)
app.use(
  cors({
    origin: [env.appOrigin, 'http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: false,
  }),
)
app.use(express.json({ limit: '128kb' }))

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    supabaseConfigured,
    environment: process.env.NODE_ENV ?? 'development',
    time: new Date().toISOString(),
  })
})

app.use('/api/public', publicRoutes)
app.use('/api/customer-auth', customerAuthRoutes)
app.use('/api/staff', staffRoutes)
app.use('/api/admin', adminRoutes)

app.use('/api', (_req, res) => {
  res.status(404).json({ ok: false, message: 'API route not found.' })
})

// Serve the built SPA when it exists (production / local `npm run build`).
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distDir = path.join(projectRoot, 'dist')
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next()
    res.sendFile(path.join(distDir, 'index.html'))
  })
}

function errorCode(details: unknown): string | undefined {
  if (details && typeof details === 'object' && 'code' in details) {
    const code = (details as { code?: unknown }).code
    return typeof code === 'string' && code ? code : undefined
  }
  return undefined
}

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof HttpError) {
    res.status(error.status).json({
      ok: false,
      message: error.message,
      code: errorCode(error.details),
    })
    return
  }

  // Anything that reaches here is a bug or an infrastructure failure. Hand the
  // client a reference so the matching server log line can be found instead of
  // showing an unexplained "Something went wrong".
  const reference = randomUUID().slice(0, 8)
  const message = error instanceof Error ? error.message : 'Unexpected error.'
  console.error(`[api] unhandled error (ref ${reference})`, error)
  res.status(500).json({
    ok: false,
    code: 'unexpected_error',
    reference,
    message: env.isProduction
      ? `The server could not process this request. Reference: ${reference}. Quote this reference when reporting the problem.`
      : `Unexpected server error: ${message}. Reference: ${reference}.`,
  })
})

export function createServer(port = env.port) {
  return app.listen(port, () => {
    console.log(`\nAON FIBER API listening on http://localhost:${port}`)
    if (!supabaseConfigured) {
      console.warn(
        '⚠  Supabase is not configured yet. Copy .env.example to .env and add your project keys.\n' +
          '   See README.md → "Supabase setup".',
      )
    }
    if (env.otpDevMode && !env.isProduction) {
      console.log('   OTP development mode is ON (codes are logged and returned to the login screen).')
    }
    if (!env.notifyWebhookUrl) {
      console.log('   External email/SMS delivery is not configured; using in-app notifications only.')
    }
  })
}

if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  createServer()
}

export default app
