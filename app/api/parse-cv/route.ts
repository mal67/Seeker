import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const filename = file.name.toLowerCase()

    let text = ''

    if (filename.endsWith('.pdf')) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pdfModule = await import('pdf-parse') as any
      const pdfParse = pdfModule.default ?? pdfModule
      const result = await pdfParse(buffer)
      text = result.text
    } else if (filename.endsWith('.docx') || filename.endsWith('.doc')) {
      const mammoth = await import('mammoth')
      const result = await mammoth.extractRawText({ buffer })
      text = result.value
    } else {
      // Plain text
      text = new TextDecoder().decode(buffer)
    }

    text = text.trim()
    if (!text) {
      return NextResponse.json({ error: 'Could not extract text from file' }, { status: 422 })
    }

    return NextResponse.json({ text, filename: file.name })
  } catch (err) {
    console.error('parse-cv error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
