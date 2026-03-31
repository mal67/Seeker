import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { buildEditPrompt } from '@/lib/prompts'
import type { TailoredApplication } from '@/lib/types'

export async function POST(request: NextRequest) {
  try {
    const { cvText, application, editRequest } = (await request.json()) as {
      cvText: string
      application: TailoredApplication
      editRequest: string
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const prompt = buildEditPrompt(
      cvText,
      application.tailoredCv,
      application.coverLetter,
      application.job.title,
      application.job.company,
      editRequest
    )

    const response = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }],
    })

    const fullText = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')

    const cvMatch = fullText.match(/<tailored_cv>([\s\S]*?)<\/tailored_cv>/)
    const coverMatch = fullText.match(/<cover_letter>([\s\S]*?)<\/cover_letter>/)
    const changeNote = fullText
      .replace(/<tailored_cv>[\s\S]*?<\/tailored_cv>/, '')
      .replace(/<cover_letter>[\s\S]*?<\/cover_letter>/, '')
      .trim()

    return NextResponse.json({
      tailoredCv: cvMatch ? cvMatch[1].trim() : application.tailoredCv,
      coverLetter: coverMatch ? coverMatch[1].trim() : application.coverLetter,
      changesSummary: changeNote
        ? `${application.changesSummary}\n\nEdit applied: ${changeNote}`
        : application.changesSummary,
    })
  } catch (err) {
    console.error('edit error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
