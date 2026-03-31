import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { TAILOR_SYSTEM_PROMPT, buildTailorPrompt } from '@/lib/prompts'
import type { Criteria, JobListing, TailoredApplication } from '@/lib/types'

export const maxDuration = 300

export async function POST(request: NextRequest) {
  const { cvText, jobs, criteria, coverLetterPref } = (await request.json()) as {
    cvText: string
    jobs: JobListing[]
    criteria: Criteria
    coverLetterPref: string
  }

  const encoder = new TextEncoder()
  // eslint-disable-next-line prefer-const
  let send!: (event: string, data: string) => void
  // eslint-disable-next-line prefer-const
  let closeStream!: () => void

  const stream = new ReadableStream({
    start(controller) {
      send = (event: string, data: string) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`))
      }
      closeStream = () => controller.close()
    },
  })

  ;(async () => {
    try {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

      for (let i = 0; i < jobs.length; i++) {
        const job = jobs[i]
        send('progress', `Tailoring CV ${i + 1} of ${jobs.length}: ${job.title} at ${job.company}…`)

        const prompt = buildTailorPrompt(cvText, job, coverLetterPref)

        const response = await client.messages.create({
          model: 'claude-opus-4-6',
          max_tokens: 8000,
          system: TAILOR_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: prompt }],
        })

        const fullText = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('')

        const cvMatch = fullText.match(/<tailored_cv>([\s\S]*?)<\/tailored_cv>/)
        const coverMatch = fullText.match(/<cover_letter>([\s\S]*?)<\/cover_letter>/)
        const changesSummary = fullText
          .replace(/<tailored_cv>[\s\S]*?<\/tailored_cv>/, '')
          .replace(/<cover_letter>[\s\S]*?<\/cover_letter>/, '')
          .trim()

        const application: TailoredApplication = {
          id: job.id,
          job,
          tailoredCv: cvMatch ? cvMatch[1].trim() : cvText,
          coverLetter: coverMatch ? coverMatch[1].trim() : null,
          changesSummary: changesSummary || 'CV tailored for this role.',
          userStatus: 'pending',
          editRequest: '',
        }

        send('application', JSON.stringify(application))
      }

      send('done', 'true')
    } catch (err) {
      console.error('tailor error:', err)
      send('error', String(err))
    } finally {
      closeStream()
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
