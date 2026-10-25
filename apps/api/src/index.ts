import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { logger } from 'hono/logger'

const app = new Hono().basePath('/api')

app.use(logger())

app.get('/health', (c) => c.json({ status: 'ok' }))

const port = Number(process.env.PORT) || 3000

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`API running on http://localhost:${info.port}`)
})
