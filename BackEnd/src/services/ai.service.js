const { GoogleGenerativeAI } = require('@google/generative-ai');

const reviewInstructions = `You are a senior software engineer reviewing code. Return only valid JSON matching this shape:
{
  "summary": "short overall assessment",
  "findings": [
    {
      "severity": "critical | high | medium | low | info",
      "title": "short finding title",
      "file": "path of the affected file",
      "startLine": 1,
      "endLine": 1,
      "description": "what is wrong and why it matters",
      "recommendation": "how to fix it",
      "patch": "a concise suggested code change, or an empty string when a safe patch cannot be inferred"
    }
  ]
}
Use 1-based line numbers from the supplied source. Do not invent a finding or patch. If there are no actionable findings, return an empty findings array and explain that in summary. Use null for unknown line numbers.`;

const retryableStatuses = new Set([408, 429, 500, 502, 503, 504]);
const requestTimeoutMs = 30_000;
const maxAttempts = 3;

function shouldRetry(error) {
    if (retryableStatuses.has(error.status)) return true;
    return !error.status && (error.name === 'AbortError' || error.name === 'TypeError');
}

async function generateContent(files, options = {}) {
    const apiKey = process.env.GOOGLE_GEMINI_KEY;
    if (!apiKey) throw new Error('GOOGLE_GEMINI_KEY is not configured');

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
        model: 'gemini-3.1-flash-lite',
        systemInstruction: reviewInstructions,
        generationConfig: { responseMimeType: 'application/json' },
    });
    const extensions = { javascript: 'js', typescript: 'ts', python: 'py', java: 'java', csharp: 'cs', go: 'go', ruby: 'rb', php: 'php', rust: 'rs', cpp: 'cpp', sql: 'sql', other: 'txt' };
    const strictnessGuidance = {
        lenient: 'Report only clear, meaningful problems. Ignore minor style preferences.',
        balanced: 'Report meaningful bugs and risks, plus relevant maintainability issues.',
        strict: 'Report issues thoroughly, including edge cases and smaller maintainability concerns. Avoid unsupported speculation.',
    };
    const sources = files.map(({ path, content }) => `File: ${path}\n\`\`\`${options.language || ''}\n${content}\n\`\`\``).join('\n\n');
    const prompt = `Review these ${options.language || 'javascript'} files together. Prioritize ${options.focus || 'correctness'}. ${strictnessGuidance[options.strictness] || strictnessGuidance.balanced} Use the exact supplied file paths for findings and 1-based lines within each file.\n\n${sources}`;
    let result;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            result = await model.generateContent(prompt, { timeout: requestTimeoutMs });
            break;
        } catch (error) {
            if (attempt === maxAttempts || !shouldRetry(error)) {
                if (attempt === maxAttempts && (error.name === 'AbortError' || error.cause?.name === 'AbortError')) {
                    error.code = 'REVIEW_TIMEOUT';
                }
                throw error;
            }
            await new Promise((resolve) => setTimeout(resolve, 400 * (2 ** (attempt - 1))));
        }
    }
    const review = JSON.parse(result.response.text());
    if (!review || typeof review.summary !== 'string' || !Array.isArray(review.findings)) {
        throw new Error('The review service returned an invalid review format');
    }
    return {
        summary: review.summary,
        findings: review.findings.map((finding) => ({
            severity: ['critical', 'high', 'medium', 'low', 'info'].includes(String(finding.severity).toLowerCase())
                ? String(finding.severity).toLowerCase()
                : 'info',
            title: String(finding.title || 'Code finding'),
            file: String(finding.file || 'snippet.js'),
            startLine: Number.isInteger(finding.startLine) && finding.startLine > 0 ? finding.startLine : null,
            endLine: Number.isInteger(finding.endLine) && finding.endLine > 0 ? finding.endLine : null,
            description: String(finding.description || ''),
            recommendation: String(finding.recommendation || ''),
            patch: typeof finding.patch === 'string' ? finding.patch : '',
        })),
    };
}

module.exports = generateContent;
