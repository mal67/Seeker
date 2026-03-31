export const SEARCH_SYSTEM_PROMPT = `You are an expert job search agent. Your task is to systematically search job boards and find roles that match the user's criteria.

## Your approach
1. For each job board URL provided, use web_search to find relevant listings (e.g. search "site:reed.co.uk senior data engineer remote")
2. Use web_fetch to retrieve full job descriptions for promising listings
3. Extract all relevant details from each listing
4. Apply the user's criteria to score and filter jobs
5. Output a structured JSON summary at the very end

## Scoring guide (total 0–100)
- Title relevance: 0–25 (how closely the job title matches the target)
- Must-have skills overlap: 0–25 (how many must-have skills are mentioned)
- Nice-to-have skills: 0–15
- Seniority match: 0–15
- Salary fit: 0–10 (0 if salary not listed)
- Industry match: 0–10

## Hard reject (set score to 0 and status to appropriate value)
- Matches any dealbreaker rule → status: "agency" or include in notes
- Title is completely unrelated → skip entirely
- Location mismatch (not remote and not in range) → skip
- Salary ceiling below stated minimum (when both are known) → skip

## Behaviour notes
- If a site blocks access or returns an error, note it and move on
- If a listing has expired, include it with status: "expired"
- Be thorough — paginate through results where possible
- Note any ambiguous matches with a low score and explanation in "notes"

## CRITICAL: Final output format
At the very end of your response, you MUST output a JSON block in this exact format:

\`\`\`json
[
  {
    "id": "job-1",
    "title": "Senior Data Engineer",
    "company": "Acme Corp",
    "location": "Remote, UK",
    "salary": "£70,000 – £85,000",
    "datePosted": "2024-01-15",
    "description": "Full job description text...",
    "applicationUrl": "https://example.com/apply",
    "score": 87,
    "scoreReasons": "Python (must-have), Spark (must-have), Senior level, Remote UK, Fintech",
    "status": "active",
    "notes": ""
  }
]
\`\`\`

If no jobs are found at all, output: \`\`\`json\n[]\n\`\`\`
`

export const TAILOR_SYSTEM_PROMPT = `You are an expert CV/resume tailoring specialist. You help candidates present their existing experience in the most compelling way for specific roles.

## Core rules — never break these
1. NEVER fabricate, invent, or add experience, skills, or qualifications not present in the original CV
2. You may only reword, reorder, and emphasise what already exists
3. Mirror the job's terminology only where the candidate genuinely has that experience
4. If the job requires something the candidate clearly doesn't have, do not pretend they do

## What to tailor
- Personal summary / profile: rewrite to target this specific role (2–4 sentences)
- Skills section: reorder to lead with the most relevant skills for this role
- Experience bullet points: adjust emphasis to highlight relevant achievements — same facts, shifted wording
- Add a "Key Skills" section at the top if the original doesn't have one

## Output format
First, write a brief summary of what you changed and why (2–4 sentences).
Then output the complete tailored CV wrapped in XML tags:

<tailored_cv>
[Full tailored CV text here]
</tailored_cv>

If a cover letter is requested, output it after the CV:

<cover_letter>
[Cover letter text here — 3–4 paragraphs]
</cover_letter>
`

export function buildSearchPrompt(
  cvText: string,
  criteria: {
    targetTitles: string
    seniority: string
    location: string
    salaryMin: string
    salaryMax: string
    currency: string
    contractType: string
    mustHaveSkills: string
    niceToHaveSkills: string
    dealbreakers: string
    industry: string
  },
  sites: string[],
  coverLetterPref: string,
  applicationLimit: number | null
): string {
  const salaryRange =
    criteria.salaryMin || criteria.salaryMax
      ? `${criteria.currency}${criteria.salaryMin}${criteria.salaryMax ? ` – ${criteria.currency}${criteria.salaryMax}` : '+'}`
      : 'Not specified'

  return `Please search the following job boards for roles matching my criteria.

## Job Criteria
- **Target titles**: ${criteria.targetTitles || 'Not specified'}
- **Seniority**: ${criteria.seniority}
- **Location**: ${criteria.location || 'Not specified'}
- **Salary**: ${salaryRange}
- **Contract type**: ${criteria.contractType}
- **Industry**: ${criteria.industry || 'Any'}
- **Must-have skills**: ${criteria.mustHaveSkills || 'None specified'}
- **Nice-to-have skills**: ${criteria.niceToHaveSkills || 'None specified'}
- **Dealbreakers**: ${criteria.dealbreakers || 'None'}
${applicationLimit ? `- **Max results to find**: ${applicationLimit}` : ''}

## Sites to search
${sites.map((s, i) => `${i + 1}. ${s}`).join('\n')}

## My CV (for context — use this to understand my background when scoring)
\`\`\`
${cvText}
\`\`\`

Please search each site systematically, extract matching job listings, score them against my criteria, and output the structured JSON at the end.`
}

export function buildTailorPrompt(
  cvText: string,
  job: {
    title: string
    company: string
    description: string
    location: string
    salary: string
  },
  coverLetterPref: string
): string {
  const needsCoverLetter = coverLetterPref === 'short' || coverLetterPref === 'if-required'

  return `Please tailor my CV for the following role.

## Target Role
- **Title**: ${job.title}
- **Company**: ${job.company}
- **Location**: ${job.location}
- **Salary**: ${job.salary || 'Not listed'}

## Job Description
${job.description}

## My Base CV
\`\`\`
${cvText}
\`\`\`

${needsCoverLetter ? `Please also write a short cover letter (3–4 paragraphs) tailored to this role.` : 'No cover letter needed.'}

Remember: only reword and reorder what is already in my CV. Do not add skills or experience I do not have.`
}

export function buildEditPrompt(
  originalCv: string,
  tailoredCv: string,
  coverLetter: string | null,
  jobTitle: string,
  jobCompany: string,
  editRequest: string
): string {
  return `I need you to apply the following edit to this tailored CV application.

## Role
${jobTitle} at ${jobCompany}

## Current Tailored CV
\`\`\`
${tailoredCv}
\`\`\`

${coverLetter ? `## Current Cover Letter\n${coverLetter}\n` : ''}

## Original Base CV (for reference — do not add anything not in here)
\`\`\`
${originalCv}
\`\`\`

## Requested Edit
${editRequest}

Please apply the edit and output the result. Remember: never add experience or skills not present in the original CV.

Output a brief note about what you changed, then the updated content in the same XML tags:
<tailored_cv>
[Updated CV here]
</tailored_cv>
${coverLetter ? `<cover_letter>\n[Updated cover letter here]\n</cover_letter>` : ''}`
}
