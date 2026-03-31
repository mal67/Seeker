export type SeniorityLevel = 'Junior' | 'Mid' | 'Senior' | 'Lead' | 'Principal' | 'Any'
export type ContractType = 'Permanent' | 'Contract' | 'Freelance' | 'Any'
export type CoverLetterPref = 'none' | 'short' | 'if-required'
export type AppStep = 'setup' | 'searching' | 'shortlist' | 'tailoring' | 'review' | 'done'

export interface Criteria {
  targetTitles: string
  seniority: SeniorityLevel
  location: string
  salaryMin: string
  salaryMax: string
  currency: string
  contractType: ContractType
  mustHaveSkills: string
  niceToHaveSkills: string
  dealbreakers: string
  industry: string
}

export interface JobListing {
  id: string
  title: string
  company: string
  location: string
  salary: string
  datePosted: string
  description: string
  applicationUrl: string
  score: number
  scoreReasons: string
  status: 'active' | 'expired' | 'agency' | 'unknown'
  notes: string
}

export interface TailoredApplication {
  id: string
  job: JobListing
  tailoredCv: string
  coverLetter: string | null
  changesSummary: string
  userStatus: 'pending' | 'approved' | 'rejected'
  editRequest: string
}
