# get rich or die trying
# Seeker — AI Job Application Agent

An AI-powered job application assistant that searches job boards, tailors your CV for each role, and manages the review/approval process — all in a clean web UI.

Built with **Next.js 16**, **TypeScript**, **Tailwind CSS**, and **Claude claude-opus-4-6** (Anthropic).

## What it does

1. **Upload your CV** — PDF, DOCX, or plain text
2. **Set your criteria** — titles, location, salary, skills, dealbreakers
3. **Add job board URLs** — e.g. `reed.co.uk`, `linkedin.com/jobs`
4. **Claude searches** — finds and scores matching roles in real time
5. **You select** — pick which roles to apply for from the shortlist
6. **Claude tailors your CV** — for each selected role, without fabricating anything
7. **You review** — approve, reject, or request edits per application
8. **Copy & apply** — copy your tailored CV and open the job link to apply

> **Hard rule:** Nothing is ever submitted without your explicit approval.

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- An [Anthropic API key](https://console.anthropic.com/) (get one free at console.anthropic.com)

## Setup

```bash
# 1. Clone the repo
git clone https://github.com/mal67/Seeker.git
cd Seeker

# 2. Install dependencies
npm install

# 3. Add your API key
cp .env.local.example .env.local
# Open .env.local and replace "your_api_key_here" with your actual key

# 4. Start the app
npm run dev
```

Then open **http://localhost:3000** in your browser.

## Environment variable

Create a `.env.local` file in the project root with:

```
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

Your API key is never committed to git (`.env.local` is in `.gitignore`).

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| AI | Anthropic SDK — claude-opus-4-6 |
| CV parsing | pdf-parse, mammoth |
| Job search | Claude with web_search + web_fetch tools |
