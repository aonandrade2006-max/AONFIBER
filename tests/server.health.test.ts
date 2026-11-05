import type { AddressInfo } from 'node:net'
import { createServer } from '../server/index'

describe('server startup', () => {
  it('starts and serves the health endpoint', async () => {
    const app = await createServer(0)
    const addr = app.address() as AddressInfo | null
    const port = typeof addr?.port === 'number' ? addr.port : 0

    expect(port).toBeGreaterThan(0)

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`)
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.ok).toBe(true)
    } finally {
      app.close()
    }
  })
})

export {}
