'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import type {
  AppStep,
  Criteria,
  JobListing,
  TailoredApplication,
  CoverLetterPref,
} from '@/lib/types'

// ─── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_CRITERIA: Criteria = {
  targetTitles: '',
  seniority: 'Any',
  location: '',
  salaryMin: '',
  salaryMax: '',
  currency: '£',
  contractType: 'Any',
  mustHaveSkills: '',
  niceToHaveSkills: '',
  dealbreakers: '',
  industry: '',
}

// ─── SSE helper ──────────────────────────────────────────────────────────────

async function consumeSSE(
  url: string,
  body: object,
  onEvent: (event: string, data: string) => void
) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`)

  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const parts = buffer.split('\n\n')
    buffer = parts.pop() ?? ''

    for (const part of parts) {
      const lines = part.trim().split('\n')
      let eventName = 'message'
      let eventData = ''
      for (const line of lines) {
        if (line.startsWith('event: ')) eventName = line.slice(7).trim()
        else if (line.startsWith('data: ')) eventData = line.slice(6)
      }
      if (eventData) onEvent(eventName, eventData)
    }
  }
}

// ─── Step indicator ──────────────────────────────────────────────────────────

const STEPS: { id: AppStep; label: string }[] = [
  { id: 'setup', label: 'Setup' },
  { id: 'searching', label: 'Search' },
  { id: 'shortlist', label: 'Shortlist' },
  { id: 'tailoring', label: 'Tailor' },
  { id: 'review', label: 'Review' },
  { id: 'done', label: 'Done' },
]

function StepIndicator({ current }: { current: AppStep }) {
  const currentIdx = STEPS.findIndex((s) => s.id === current)
  return (
    <div className="flex items-center gap-0 mb-8">
      {STEPS.map((step, i) => {
        const done = i < currentIdx
        const active = i === currentIdx
        return (
          <div key={step.id} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-colors ${
                  done
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : active
                    ? 'bg-white border-blue-600 text-blue-600'
                    : 'bg-white border-gray-300 text-gray-400'
                }`}
              >
                {done ? '✓' : i + 1}
              </div>
              <span
                className={`text-xs mt-1 font-medium ${
                  active ? 'text-blue-600' : done ? 'text-blue-500' : 'text-gray-400'
                }`}
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`h-0.5 w-12 mx-1 mb-4 ${i < currentIdx ? 'bg-blue-600' : 'bg-gray-200'}`}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Score badge ─────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 70
      ? 'bg-green-100 text-green-800'
      : score >= 50
      ? 'bg-yellow-100 text-yellow-800'
      : 'bg-red-100 text-red-800'
  return <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${color}`}>{score}</span>
}

// ─── Setup Step ──────────────────────────────────────────────────────────────

function SetupStep({
  onStart,
}: {
  onStart: (data: {
    cvText: string
    cvFileName: string
    criteria: Criteria
    sites: string[]
    coverLetterPref: CoverLetterPref
    applicationLimit: number | null
  }) => void
}) {
  const [cvText, setCvText] = useState('')
  const [cvFileName, setCvFileName] = useState('')
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState('')
  const [criteria, setCriteria] = useState<Criteria>(DEFAULT_CRITERIA)
  const [sites, setSites] = useState<string[]>([''])
  const [coverLetterPref, setCoverLetterPref] = useState<CoverLetterPref>('if-required')
  const [limitInput, setLimitInput] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFileChange = async (file: File) => {
    setParsing(true)
    setParseError('')
    const form = new FormData()
    form.append('file', file)
    try {
      const res = await fetch('/api/parse-cv', { method: 'POST', body: form })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setCvText(data.text)
      setCvFileName(data.filename)
    } catch (e) {
      setParseError(String(e))
    } finally {
      setParsing(false)
    }
  }

  const updateSite = (i: number, val: string) => {
    const next = [...sites]
    next[i] = val
    setSites(next)
  }

  const addSite = () => setSites([...sites, ''])
  const removeSite = (i: number) => setSites(sites.filter((_, idx) => idx !== i))

  const validSites = sites.filter((s) => s.trim())
  const canStart = cvText && validSites.length > 0 && criteria.targetTitles.trim()

  const handleStart = () => {
    if (!canStart) return
    onStart({
      cvText,
      cvFileName,
      criteria,
      sites: validSites,
      coverLetterPref,
      applicationLimit: limitInput ? parseInt(limitInput) : null,
    })
  }

  const setCrit = (k: keyof Criteria, v: string) =>
    setCriteria((c) => ({ ...c, [k]: v }))

  return (
    <div className="space-y-6">
      {/* CV Upload */}
      <section className="card">
        <h2 className="section-title">1. Your CV</h2>
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            cvText
              ? 'border-green-400 bg-green-50'
              : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'
          }`}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            const file = e.dataTransfer.files[0]
            if (file) handleFileChange(file)
          }}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.doc,.txt"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleFileChange(file)
            }}
          />
          {parsing ? (
            <p className="text-blue-600 font-medium">Parsing CV…</p>
          ) : cvText ? (
            <div>
              <p className="text-green-700 font-semibold">✓ {cvFileName}</p>
              <p className="text-green-600 text-sm mt-1">
                {cvText.length.toLocaleString()} characters extracted — click to replace
              </p>
            </div>
          ) : (
            <div>
              <p className="text-gray-600 font-medium">Drop your CV here or click to upload</p>
              <p className="text-gray-400 text-sm mt-1">Supports PDF, DOCX, DOC, TXT</p>
            </div>
          )}
        </div>
        {parseError && <p className="text-red-600 text-sm mt-2">{parseError}</p>}
      </section>

      {/* Job Criteria */}
      <section className="card">
        <h2 className="section-title">2. Job Criteria</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="field-label">Target job titles *</label>
            <input
              className="field-input"
              placeholder='e.g. "Senior Data Engineer, Data Platform Engineer"'
              value={criteria.targetTitles}
              onChange={(e) => setCrit('targetTitles', e.target.value)}
            />
          </div>
          <div>
            <label className="field-label">Location</label>
            <input
              className="field-input"
              placeholder='e.g. "Remote UK" or "London"'
              value={criteria.location}
              onChange={(e) => setCrit('location', e.target.value)}
            />
          </div>
          <div>
            <label className="field-label">Seniority</label>
            <select
              className="field-input"
              value={criteria.seniority}
              onChange={(e) => setCrit('seniority', e.target.value as Criteria['seniority'])}
            >
              {['Any', 'Junior', 'Mid', 'Senior', 'Lead', 'Principal'].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">Salary range</label>
            <div className="flex gap-2 items-center">
              <select
                className="field-input w-16"
                value={criteria.currency}
                onChange={(e) => setCrit('currency', e.target.value)}
              >
                {['£', '$', '€'].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <input
                className="field-input flex-1"
                placeholder="Min (e.g. 60000)"
                value={criteria.salaryMin}
                onChange={(e) => setCrit('salaryMin', e.target.value)}
              />
              <span className="text-gray-400">–</span>
              <input
                className="field-input flex-1"
                placeholder="Max"
                value={criteria.salaryMax}
                onChange={(e) => setCrit('salaryMax', e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="field-label">Contract type</label>
            <select
              className="field-input"
              value={criteria.contractType}
              onChange={(e) =>
                setCrit('contractType', e.target.value as Criteria['contractType'])
              }
            >
              {['Any', 'Permanent', 'Contract', 'Freelance'].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">Must-have skills</label>
            <input
              className="field-input"
              placeholder='e.g. "Python, Spark, AWS"'
              value={criteria.mustHaveSkills}
              onChange={(e) => setCrit('mustHaveSkills', e.target.value)}
            />
          </div>
          <div>
            <label className="field-label">Nice-to-have skills</label>
            <input
              className="field-input"
              placeholder='e.g. "Kafka, dbt, Kubernetes"'
              value={criteria.niceToHaveSkills}
              onChange={(e) => setCrit('niceToHaveSkills', e.target.value)}
            />
          </div>
          <div>
            <label className="field-label">Industry / sector</label>
            <input
              className="field-input"
              placeholder='e.g. "Fintech, SaaS"'
              value={criteria.industry}
              onChange={(e) => setCrit('industry', e.target.value)}
            />
          </div>
          <div>
            <label className="field-label">Dealbreakers</label>
            <input
              className="field-input"
              placeholder='e.g. "No agencies, no security clearance"'
              value={criteria.dealbreakers}
              onChange={(e) => setCrit('dealbreakers', e.target.value)}
            />
          </div>
        </div>
      </section>

      {/* Sites */}
      <section className="card">
        <h2 className="section-title">3. Job Boards to Search</h2>
        <div className="space-y-2">
          {sites.map((site, i) => (
            <div key={i} className="flex gap-2">
              <input
                className="field-input flex-1"
                placeholder="https://www.reed.co.uk/jobs"
                value={site}
                onChange={(e) => updateSite(i, e.target.value)}
              />
              {sites.length > 1 && (
                <button
                  className="px-3 py-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  onClick={() => removeSite(i)}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          <button
            className="text-blue-600 text-sm hover:underline"
            onClick={addSite}
          >
            + Add another site
          </button>
        </div>
      </section>

      {/* Preferences */}
      <section className="card">
        <h2 className="section-title">4. Preferences</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="field-label">Cover letters</label>
            <div className="space-y-2 mt-1">
              {(
                [
                  ['none', 'No cover letters'],
                  ['if-required', 'Only if the form has a cover letter field'],
                  ['short', 'Always write a short one (3–4 paragraphs)'],
                ] as [CoverLetterPref, string][]
              ).map(([v, l]) => (
                <label key={v} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value={v}
                    checked={coverLetterPref === v}
                    onChange={() => setCoverLetterPref(v)}
                    className="accent-blue-600"
                  />
                  <span className="text-sm text-gray-700">{l}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="field-label">Max applications this session</label>
            <input
              className="field-input w-32"
              type="number"
              min="1"
              placeholder="No limit"
              value={limitInput}
              onChange={(e) => setLimitInput(e.target.value)}
            />
          </div>
        </div>
      </section>

      <button
        className={`btn-primary w-full text-lg py-3 ${!canStart ? 'opacity-50 cursor-not-allowed' : ''}`}
        disabled={!canStart}
        onClick={handleStart}
      >
        Search for Jobs →
      </button>
      {!cvText && (
        <p className="text-sm text-gray-500 text-center">Upload your CV to get started</p>
      )}
      {cvText && !criteria.targetTitles.trim() && (
        <p className="text-sm text-gray-500 text-center">Enter target job titles to continue</p>
      )}
    </div>
  )
}

// ─── Searching Step ───────────────────────────────────────────────────────────

function SearchingStep({ log, error }: { log: string; error: string }) {
  const logRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [log])

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <h2 className="text-lg font-semibold text-gray-900">Searching job boards…</h2>
        </div>
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-red-700 text-sm">
            {error}
          </div>
        )}
        <pre
          ref={logRef}
          className="bg-gray-950 text-green-400 rounded-lg p-4 text-xs font-mono h-96 overflow-y-auto whitespace-pre-wrap leading-relaxed"
        >
          {log || 'Initialising…'}
        </pre>
      </div>
    </div>
  )
}

// ─── Shortlist Step ───────────────────────────────────────────────────────────

function ShortlistStep({
  jobs,
  selectedIds,
  onToggle,
  onSelectAll,
  onDeselectAll,
  onProceed,
}: {
  jobs: JobListing[]
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onSelectAll: () => void
  onDeselectAll: () => void
  onProceed: () => void
}) {
  const sorted = [...jobs].sort((a, b) => b.score - a.score)

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {jobs.length} matching role{jobs.length !== 1 ? 's' : ''} found
          </h2>
          <div className="flex gap-2">
            <button
              className="text-sm text-blue-600 hover:underline px-2 py-1"
              onClick={onSelectAll}
            >
              Select all
            </button>
            <button
              className="text-sm text-gray-500 hover:underline px-2 py-1"
              onClick={onDeselectAll}
            >
              Deselect all
            </button>
          </div>
        </div>

        {jobs.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p className="text-lg mb-2">No matching jobs found.</p>
            <p className="text-sm">
              Try broadening your criteria or adding more job board URLs.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500 text-xs uppercase tracking-wide">
                  <th className="pb-2 pr-3">Include</th>
                  <th className="pb-2 pr-3">#</th>
                  <th className="pb-2 pr-3">Title</th>
                  <th className="pb-2 pr-3">Company</th>
                  <th className="pb-2 pr-3">Location</th>
                  <th className="pb-2 pr-3">Salary</th>
                  <th className="pb-2 pr-3">Score</th>
                  <th className="pb-2">Match reasons</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((job, i) => (
                  <tr
                    key={job.id}
                    className={`border-b border-gray-100 transition-colors cursor-pointer ${
                      selectedIds.has(job.id) ? 'bg-blue-50' : 'hover:bg-gray-50'
                    }`}
                    onClick={() => onToggle(job.id)}
                  >
                    <td className="py-3 pr-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(job.id)}
                        onChange={() => onToggle(job.id)}
                        className="accent-blue-600 w-4 h-4"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                    <td className="py-3 pr-3 text-gray-400">{i + 1}</td>
                    <td className="py-3 pr-3 font-medium text-gray-900 max-w-48">
                      <div className="truncate">{job.title}</div>
                      {job.status === 'expired' && (
                        <span className="text-xs text-red-500">Expired</span>
                      )}
                    </td>
                    <td className="py-3 pr-3 text-gray-600 max-w-40">
                      <div className="truncate">{job.company}</div>
                    </td>
                    <td className="py-3 pr-3 text-gray-500 max-w-32">
                      <div className="truncate">{job.location}</div>
                    </td>
                    <td className="py-3 pr-3 text-gray-600 whitespace-nowrap">
                      {job.salary || '—'}
                    </td>
                    <td className="py-3 pr-3">
                      <ScoreBadge score={job.score} />
                    </td>
                    <td className="py-3 text-gray-500 text-xs max-w-48">
                      <div className="truncate">{job.scoreReasons}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {jobs.length > 0 && (
        <button
          className={`btn-primary w-full py-3 ${selectedIds.size === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
          disabled={selectedIds.size === 0}
          onClick={onProceed}
        >
          Tailor CV for {selectedIds.size} selected role
          {selectedIds.size !== 1 ? 's' : ''} →
        </button>
      )}
    </div>
  )
}

// ─── Tailoring Step ───────────────────────────────────────────────────────────

function TailoringStep({
  log,
  total,
  done,
  error,
}: {
  log: string
  total: number
  done: number
  error: string
}) {
  const logRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [log])

  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <h2 className="text-lg font-semibold text-gray-900">
            Tailoring CVs… ({done}/{total})
          </h2>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-red-700 text-sm">
            {error}
          </div>
        )}
        <pre
          ref={logRef}
          className="bg-gray-950 text-green-400 rounded-lg p-4 text-xs font-mono h-48 overflow-y-auto whitespace-pre-wrap leading-relaxed"
        >
          {log || 'Starting…'}
        </pre>
      </div>
    </div>
  )
}

// ─── Review Step ─────────────────────────────────────────────────────────────

function ReviewStep({
  applications,
  cvText,
  onApprove,
  onReject,
  onEdit,
  onProceed,
}: {
  applications: TailoredApplication[]
  cvText: string
  onApprove: (id: string) => void
  onReject: (id: string) => void
  onEdit: (id: string, request: string) => Promise<void>
  onProceed: () => void
}) {
  const [expanded, setExpanded] = useState<Set<string>>(
    new Set(applications[0] ? [applications[0].id] : [])
  )
  const [editInputs, setEditInputs] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState<Set<string>>(new Set())

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleEdit = async (id: string) => {
    const req = editInputs[id]?.trim()
    if (!req) return
    setEditing((prev) => new Set(prev).add(id))
    await onEdit(id, req)
    setEditing((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    setEditInputs((prev) => ({ ...prev, [id]: '' }))
  }

  const approvedCount = applications.filter((a) => a.userStatus === 'approved').length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Review your applications</h2>
          <p className="text-sm text-gray-500">
            {approvedCount} approved ·{' '}
            {applications.filter((a) => a.userStatus === 'pending').length} pending ·{' '}
            {applications.filter((a) => a.userStatus === 'rejected').length} rejected
          </p>
        </div>
        <button
          className="text-sm text-blue-600 hover:underline"
          onClick={() => applications.forEach((a) => onApprove(a.id))}
        >
          Approve all
        </button>
      </div>

      {applications.map((app, i) => {
        const isExpanded = expanded.has(app.id)
        const statusColor =
          app.userStatus === 'approved'
            ? 'bg-green-100 text-green-800 border-green-200'
            : app.userStatus === 'rejected'
            ? 'bg-red-100 text-red-800 border-red-200'
            : 'bg-yellow-100 text-yellow-800 border-yellow-200'

        return (
          <div
            key={app.id}
            className={`bg-white border rounded-xl shadow-sm overflow-hidden ${
              app.userStatus === 'approved'
                ? 'border-green-300'
                : app.userStatus === 'rejected'
                ? 'border-red-200 opacity-60'
                : 'border-gray-200'
            }`}
          >
            <div
              className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
              onClick={() => toggle(app.id)}
            >
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-gray-400 w-6">{i + 1}</span>
                <div>
                  <div className="font-semibold text-gray-900">{app.job.title}</div>
                  <div className="text-sm text-gray-500">
                    {app.job.company} · {app.job.location}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full border ${statusColor}`}
                >
                  {app.userStatus === 'approved'
                    ? '✓ Approved'
                    : app.userStatus === 'rejected'
                    ? '✕ Rejected'
                    : '⏳ Pending'}
                </span>
                <span className="text-gray-400">{isExpanded ? '▲' : '▼'}</span>
              </div>
            </div>

            {isExpanded && (
              <div className="border-t border-gray-100 p-4 space-y-4">
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                  <p className="text-xs font-semibold text-blue-700 uppercase mb-1">
                    Changes made
                  </p>
                  <p className="text-sm text-blue-800 whitespace-pre-wrap">
                    {app.changesSummary}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">
                    Tailored CV
                  </p>
                  <pre className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm font-mono text-gray-800 max-h-96 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                    {app.tailoredCv}
                  </pre>
                </div>

                {app.coverLetter && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-2">
                      Cover Letter
                    </p>
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                      {app.coverLetter}
                    </div>
                  </div>
                )}

                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">
                    Request an edit
                  </p>
                  <div className="flex gap-2">
                    <input
                      className="field-input flex-1 text-sm"
                      placeholder='e.g. "Tone down the leadership language in the summary"'
                      value={editInputs[app.id] || ''}
                      onChange={(e) =>
                        setEditInputs((prev) => ({ ...prev, [app.id]: e.target.value }))
                      }
                      onKeyDown={(e) => e.key === 'Enter' && handleEdit(app.id)}
                    />
                    <button
                      className="btn-secondary text-sm px-3"
                      disabled={editing.has(app.id) || !editInputs[app.id]?.trim()}
                      onClick={() => handleEdit(app.id)}
                    >
                      {editing.has(app.id) ? 'Applying…' : 'Apply'}
                    </button>
                  </div>
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                      app.userStatus === 'approved'
                        ? 'bg-green-600 text-white border-green-600'
                        : 'bg-white text-green-700 border-green-300 hover:bg-green-50'
                    }`}
                    onClick={() => onApprove(app.id)}
                  >
                    ✓ Approve
                  </button>
                  <button
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                      app.userStatus === 'rejected'
                        ? 'bg-red-600 text-white border-red-600'
                        : 'bg-white text-red-700 border-red-300 hover:bg-red-50'
                    }`}
                    onClick={() => onReject(app.id)}
                  >
                    ✕ Reject
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}

      <button
        className={`btn-primary w-full py-3 text-lg ${
          approvedCount === 0 ? 'opacity-50 cursor-not-allowed' : ''
        }`}
        disabled={approvedCount === 0}
        onClick={onProceed}
      >
        Finalise {approvedCount} approved application{approvedCount !== 1 ? 's' : ''} →
      </button>
    </div>
  )
}

// ─── Done Step ────────────────────────────────────────────────────────────────

function DoneStep({
  applications,
  onRestart,
}: {
  applications: TailoredApplication[]
  onRestart: () => void
}) {
  const approved = applications.filter((a) => a.userStatus === 'approved')
  const [copied, setCopied] = useState<string | null>(null)

  const copyCV = async (app: TailoredApplication) => {
    await navigator.clipboard.writeText(app.tailoredCv)
    setCopied(app.id)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Approved', value: approved.length, color: 'text-green-600' },
          {
            label: 'Rejected',
            value: applications.filter((a) => a.userStatus === 'rejected').length,
            color: 'text-red-500',
          },
          { label: 'Total', value: applications.length, color: 'text-blue-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="card text-center">
            <div className={`text-3xl font-bold ${color}`}>{value}</div>
            <div className="text-sm text-gray-500 mt-1">{label}</div>
          </div>
        ))}
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <p className="font-semibold text-amber-800 mb-1">About submission</p>
        <p className="text-sm text-amber-700">
          Automated form submission requires a browser automation tool (Playwright MCP). For
          now, use the buttons below to copy your tailored CV and open each job&apos;s
          application page to apply manually.
        </p>
      </div>

      <div className="card overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Approved Applications</h2>
        </div>
        {approved.length === 0 ? (
          <p className="p-8 text-center text-gray-500">No applications approved.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs uppercase text-gray-500 tracking-wide">
                <th className="p-4">#</th>
                <th className="p-4">Role</th>
                <th className="p-4">Company</th>
                <th className="p-4">Salary</th>
                <th className="p-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {approved.map((app, i) => (
                <tr key={app.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="p-4 text-gray-400">{i + 1}</td>
                  <td className="p-4 font-medium text-gray-900">{app.job.title}</td>
                  <td className="p-4 text-gray-600">{app.job.company}</td>
                  <td className="p-4 text-gray-500">{app.job.salary || '—'}</td>
                  <td className="p-4">
                    <div className="flex gap-2">
                      <button
                        className="text-xs text-blue-600 hover:underline px-2 py-1 border border-blue-200 rounded"
                        onClick={() => copyCV(app)}
                      >
                        {copied === app.id ? '✓ Copied!' : 'Copy CV'}
                      </button>
                      {app.job.applicationUrl && (
                        <a
                          href={app.job.applicationUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline px-2 py-1 border border-blue-200 rounded"
                        >
                          Open Job ↗
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <button className="btn-secondary w-full py-3" onClick={onRestart}>
        Start a new search
      </button>
    </div>
  )
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function Home() {
  const [step, setStep] = useState<AppStep>('setup')
  const [cvText, setCvText] = useState('')
  const [cvFileName, setCvFileName] = useState('')
  const [criteria, setCriteria] = useState<Criteria>(DEFAULT_CRITERIA)
  const [sites, setSites] = useState<string[]>([])
  const [coverLetterPref, setCoverLetterPref] = useState<CoverLetterPref>('if-required')
  const [applicationLimit, setApplicationLimit] = useState<number | null>(null)

  const [searchLog, setSearchLog] = useState('')
  const [searchError, setSearchError] = useState('')
  const [allJobs, setAllJobs] = useState<JobListing[]>([])

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const [tailorLog, setTailorLog] = useState('')
  const [tailorError, setTailorError] = useState('')
  const [tailorDone, setTailorDone] = useState(0)
  const [tailorTotal, setTailorTotal] = useState(0)

  const [applications, setApplications] = useState<TailoredApplication[]>([])

  const handleStart = async (data: {
    cvText: string
    cvFileName: string
    criteria: Criteria
    sites: string[]
    coverLetterPref: CoverLetterPref
    applicationLimit: number | null
  }) => {
    setCvText(data.cvText)
    setCvFileName(data.cvFileName)
    setCriteria(data.criteria)
    setSites(data.sites)
    setCoverLetterPref(data.coverLetterPref)
    setApplicationLimit(data.applicationLimit)
    setSearchLog('')
    setSearchError('')
    setAllJobs([])
    setStep('searching')

    try {
      await consumeSSE(
        '/api/search',
        {
          cvText: data.cvText,
          criteria: data.criteria,
          sites: data.sites,
          coverLetterPref: data.coverLetterPref,
          applicationLimit: data.applicationLimit,
        },
        (event, rawData) => {
          if (event === 'text') setSearchLog((prev) => prev + rawData)
          else if (event === 'status') setSearchLog((prev) => prev + rawData + '\n')
          else if (event === 'jobs') {
            try {
              setAllJobs(JSON.parse(rawData))
            } catch {
              /* ignore */
            }
          } else if (event === 'error') setSearchError(rawData)
        }
      )
    } catch (e) {
      setSearchError(String(e))
    }

    setStep('shortlist')
  }

  const handleToggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleProceedToTailor = async () => {
    const selected = allJobs.filter((j) => selectedIds.has(j.id))
    setTailorLog('')
    setTailorError('')
    setTailorDone(0)
    setTailorTotal(selected.length)
    setApplications([])
    setStep('tailoring')

    try {
      await consumeSSE(
        '/api/tailor',
        { cvText, jobs: selected, criteria, coverLetterPref },
        (event, rawData) => {
          if (event === 'progress') setTailorLog((prev) => prev + rawData + '\n')
          else if (event === 'application') {
            try {
              const app: TailoredApplication = JSON.parse(rawData)
              setApplications((prev) => [...prev, app])
              setTailorDone((n) => n + 1)
            } catch {
              /* ignore */
            }
          } else if (event === 'error') setTailorError(rawData)
        }
      )
    } catch (e) {
      setTailorError(String(e))
    }

    setStep('review')
  }

  const handleApprove = useCallback((id: string) => {
    setApplications((prev) =>
      prev.map((a) => (a.id === id ? { ...a, userStatus: 'approved' } : a))
    )
  }, [])

  const handleReject = useCallback((id: string) => {
    setApplications((prev) =>
      prev.map((a) => (a.id === id ? { ...a, userStatus: 'rejected' } : a))
    )
  }, [])

  const handleEdit = useCallback(
    async (id: string, editRequest: string) => {
      const app = applications.find((a) => a.id === id)
      if (!app) return

      const res = await fetch('/api/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cvText, application: app, editRequest }),
      })

      const data = await res.json()
      if (data.error) return

      setApplications((prev) =>
        prev.map((a) =>
          a.id === id
            ? {
                ...a,
                tailoredCv: data.tailoredCv,
                coverLetter: data.coverLetter,
                changesSummary: data.changesSummary,
              }
            : a
        )
      )
    },
    [applications, cvText]
  )

  const handleRestart = () => {
    setStep('setup')
    setSearchLog('')
    setAllJobs([])
    setSelectedIds(new Set())
    setApplications([])
  }

  // Suppress unused variable warning for cvFileName/applicationLimit
  void cvFileName
  void applicationLimit

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-xl font-bold text-gray-900">Job Application Agent</h1>
          <p className="text-sm text-gray-500">AI-powered job search and CV tailoring</p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <StepIndicator current={step} />

        {step === 'setup' && <SetupStep onStart={handleStart} />}
        {step === 'searching' && <SearchingStep log={searchLog} error={searchError} />}
        {step === 'shortlist' && (
          <ShortlistStep
            jobs={allJobs}
            selectedIds={selectedIds}
            onToggle={handleToggle}
            onSelectAll={() => setSelectedIds(new Set(allJobs.map((j) => j.id)))}
            onDeselectAll={() => setSelectedIds(new Set())}
            onProceed={handleProceedToTailor}
          />
        )}
        {step === 'tailoring' && (
          <TailoringStep
            log={tailorLog}
            total={tailorTotal}
            done={tailorDone}
            error={tailorError}
          />
        )}
        {step === 'review' && (
          <ReviewStep
            applications={applications}
            cvText={cvText}
            onApprove={handleApprove}
            onReject={handleReject}
            onEdit={handleEdit}
            onProceed={() => setStep('done')}
          />
        )}
        {step === 'done' && (
          <DoneStep applications={applications} onRestart={handleRestart} />
        )}
      </main>
    </div>
  )
}
