import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { SEARCH_SYSTEM_PROMPT, buildSearchPrompt } from '@/lib/prompts'
import type { Criteria, JobListing } from '@/lib/types'

export const maxDuration = 300

function sseStream() {
  const encoder = new TextEncoder()
  let controller: ReadableStreamDefaultController

  const stream = new ReadableStream({
    start(c) {
      controller = c
    },
  })

  const send = (event: string, data: string) => {
    controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`))
  }

  const close = () => controller.close()

  return { stream, send, close }
}

export async function POST(request: NextRequest) {
  const { cvText, criteria, sites, coverLetterPref, applicationLimit } =
    (await request.json()) as {
      cvText: string
      criteria: Criteria
      sites: string[]
      coverLetterPref: string
      applicationLimit: number | null
    }

  const { stream, send, close } = sseStream()

  ;(async () => {
    try {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      const userPrompt = buildSearchPrompt(cvText, criteria, sites, coverLetterPref, applicationLimit)

      const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userPrompt }]

      let iterations = 0
      const MAX_ITERATIONS = 15
      let finalText = ''

      send('status', 'Searching job boards…')

      while (iterations < MAX_ITERATIONS) {
        iterations++

        const apiStream = client.messages.stream({
          model: 'claude-opus-4-6',
          max_tokens: 16000,
          system: SEARCH_SYSTEM_PROMPT,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          tools: [
            { type: 'web_search_20260209', name: 'web_search' },
            { type: 'web_fetch_20260209', name: 'web_fetch' },
          ] as any,
          messages,
        })

        apiStream.on('text', (delta) => {
          finalText += delta
          send('text', delta)
        })

        const msg = await apiStream.finalMessage()

        if (msg.stop_reason === 'end_turn') {
          // Extract JSON block from the accumulated text
          const jobs = extractJobs(finalText)
          send('jobs', JSON.stringify(jobs))
          break
        }

        if (msg.stop_reason === 'pause_turn') {
          messages.push({ role: 'assistant', content: msg.content })
          continue
        }

        // Unexpected stop — try to extract whatever we have
        const jobs = extractJobs(finalText)
        send('jobs', JSON.stringify(jobs))
        break
      }

      send('done', 'true')
    } catch (err) {
      console.error('search error:', err)
      send('error', String(err))
    } finally {
      close()
    }
  })()

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

function extractJobs(text: string): JobListing[] {
  // Try fenced JSON block first
  const fenced = text.match(/```json\s*([\s\S]*?)\s*```/)
  if (fenced) {
    try {
      const parsed = JSON.parse(fenced[1])
      if (Array.isArray(parsed)) return assignIds(parsed)
    } catch {
      /* fall through */
    }
  }

  // Try raw JSON array
  const arrayMatch = text.match(/\[\s*\{[\s\S]*\}\s*\]/)
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(arrayMatch[0])
      if (Array.isArray(parsed)) return assignIds(parsed)
    } catch {
      /* fall through */
    }
  }

  return []
}

function assignIds(jobs: Partial<JobListing>[]): JobListing[] {
  return jobs.map((j, i) => ({
    id: j.id || `job-${i + 1}-${Date.now()}`,
    title: j.title || 'Unknown Title',
    company: j.company || 'Unknown Company',
    location: j.location || '',
    salary: j.salary || '',
    datePosted: j.datePosted || '',
    description: j.description || '',
    applicationUrl: j.applicationUrl || '',
    score: typeof j.score === 'number' ? j.score : 0,
    scoreReasons: j.scoreReasons || '',
    status: j.status || 'unknown',
    notes: j.notes || '',
  }))
}
