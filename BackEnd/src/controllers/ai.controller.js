const aiService = require("../services/ai.service")


function createAiController(reviewService = aiService) {
    return { getReview: async (req, res) => {

    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const maxFiles = 10;
    const maxFileBytes = 256 * 1024;
    const maxTotalBytes = 1024 * 1024;
    const files = Array.isArray(body.files)
        ? body.files
        : [{ path: 'snippet.js', content: body.code }];

    if (files.length === 0 || files.length > maxFiles) {
        return res.status(400).send(`Submit between 1 and ${maxFiles} files`);
    }
    let totalBytes = 0;
    for (const file of files) {
        if (!file || typeof file.path !== 'string' || !file.path.trim() || file.path.length > 180
            || typeof file.content !== 'string' || !file.content.trim()) {
            return res.status(400).send('Each file must have a valid path and non-empty text content');
        }
        const fileBytes = Buffer.byteLength(file.content, 'utf8');
        if (fileBytes > maxFileBytes) return res.status(413).send('Each file must be 256 KiB or smaller');
        totalBytes += fileBytes;
    }
    if (totalBytes > maxTotalBytes) return res.status(413).send('Combined file content must be 1 MiB or smaller');

    const { language = 'javascript', focus = 'correctness', strictness = 'balanced' } = body;
    const validOptions = {
        language: ['javascript', 'typescript', 'python', 'java', 'csharp', 'go', 'ruby', 'php', 'rust', 'cpp', 'sql', 'other'],
        focus: ['correctness', 'security', 'performance'],
        strictness: ['lenient', 'balanced', 'strict'],
    };
    if (!validOptions.language.includes(language)
        || !validOptions.focus.includes(focus)
        || !validOptions.strictness.includes(strictness)) {
        return res.status(400).send('Invalid review options');
    }

    try {
        const response = await reviewService(files, { language, focus, strictness });
        res.json(response);
    } catch (error) {
        console.error('Code review failed:', error.message);
        const missingKey = error.message === 'GOOGLE_GEMINI_KEY is not configured';
        if (missingKey) return res.status(503).send('Set GOOGLE_GEMINI_KEY in BackEnd/.env to enable code reviews.');
        if (error.code === 'REVIEW_TIMEOUT') return res.status(504).send('The review took too long. Try again with fewer or smaller files.');
        if (error.status === 401 || error.status === 403) {
            return res.status(502).send('Gemini rejected the API key or the key does not have access to this model.');
        }
        if (error.status === 429 || error.status >= 500 || !error.status) {
            return res.status(503).send('Gemini is temporarily unavailable. Please retry your review shortly.');
        }
        res.status(502).send('The code review service returned an unexpected response. Please try again.');
    }

    } };
}

module.exports = { ...createAiController(), createAiController };
