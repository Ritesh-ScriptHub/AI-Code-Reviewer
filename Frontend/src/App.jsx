import { useReducer, useState } from 'react'
import Editor from 'react-simple-code-editor'
import hljs from './code-highlighter.js'
import 'highlight.js/styles/github-dark.css'
import axios from 'axios'
import PropTypes from 'prop-types'
import { initialReviewState, reviewErrorMessage, reviewReducer } from './review-state.js'
import { addFilesToReview, MAX_FILE_BYTES, MAX_FILES, MAX_TOTAL_BYTES } from './file-uploads.js'
import './App.css'

const severityOrder = ['critical', 'high', 'medium', 'low', 'info']
const languageExtensions = { javascript: 'js', typescript: 'ts', python: 'py', java: 'java', csharp: 'cs', go: 'go', ruby: 'rb', php: 'php', rust: 'rs', cpp: 'cpp', sql: 'sql' }
const DEFAULT_CODE = `function sum() {
  return 1 + 1
}`
const DEFAULT_OPTIONS = { language: 'javascript', focus: 'correctness', strictness: 'balanced' }
const reviewLanguages = [
  ['javascript', 'JavaScript'], ['typescript', 'TypeScript'], ['python', 'Python'], ['java', 'Java'],
  ['csharp', 'C#'], ['go', 'Go'], ['ruby', 'Ruby'], ['php', 'PHP'], ['rust', 'Rust'],
  ['cpp', 'C++'], ['sql', 'SQL'], ['other', 'Other'],
]

function App() {
  const [code, setCode] = useState(DEFAULT_CODE)
  const [reviewState, dispatchReview] = useReducer(reviewReducer, initialReviewState)
  const [copiedPatch, setCopiedPatch] = useState('')
  const [options, setOptions] = useState(DEFAULT_OPTIONS)
  const [uploadedFiles, setUploadedFiles] = useState([])
  const [uploadProgress, setUploadProgress] = useState(null)
  const [uploadError, setUploadError] = useState('')

  async function reviewCode() {
    if (reviewState.loading || uploadProgress) return
    const files = [
      ...(code.trim() ? [{ path: `editor-buffer.${languageExtensions[options.language] || 'txt'}`, content: code }] : []),
      ...uploadedFiles.map(({ path, content }) => ({ path, content })),
    ]
    if (files.length > MAX_FILES || (code.trim() && new TextEncoder().encode(code).length > MAX_FILE_BYTES) || totalBytes > MAX_TOTAL_BYTES) {
      dispatchReview({ type: 'failure', message: 'Review input exceeds a file or total size limit. Each file can be 256 KiB; the total can be 1 MiB across 10 files.' })
      return
    }
    dispatchReview({ type: 'start' })
    try {
      const response = await axios.post('/ai/get-review', { files, ...options }, { timeout: 95_000 })
      dispatchReview({ type: 'success', review: response.data })
    } catch (requestError) {
      dispatchReview({ type: 'failure', message: reviewErrorMessage(requestError) })
    }
  }

  async function addFiles(event) {
    const selectedFiles = Array.from(event.target.files || [])
    event.target.value = ''
    setUploadError('')
    const result = await addFilesToReview(selectedFiles, {
      existingFiles: uploadedFiles,
      code,
      onProgress: setUploadProgress,
    })
    setUploadedFiles(result.files)
    setUploadError(result.errors.join(' '))
    window.setTimeout(() => setUploadProgress(null), 700)
  }

  const totalBytes = new TextEncoder().encode(code).length * (code.trim() ? 1 : 0)
    + uploadedFiles.reduce((sum, file) => sum + file.size, 0)

  async function copyPatch(patch) {
    try {
      await navigator.clipboard.writeText(patch)
      setCopiedPatch(patch)
      window.setTimeout(() => setCopiedPatch(''), 1800)
    } catch {
      dispatchReview({ type: 'failure', message: 'Could not copy the patch. Check clipboard permissions and try again.' })
    }
  }

  function resetEditor() {
    setCode(DEFAULT_CODE)
    setOptions(DEFAULT_OPTIONS)
    setUploadedFiles([])
    setUploadProgress(null)
    setUploadError('')
    setCopiedPatch('')
    dispatchReview({ type: 'reset' })
  }

  return (
    <main>
      <div className="left">
        <div className="editor-toolbar" aria-label="Review options">
          <label>Language
            <select value={options.language} onChange={(event) => setOptions({ ...options, language: event.target.value })}>
              {reviewLanguages.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </select>
          </label>
          <label>Focus
            <select value={options.focus} onChange={(event) => setOptions({ ...options, focus: event.target.value })}>
              <option value="correctness">Correctness</option>
              <option value="security">Security</option>
              <option value="performance">Performance</option>
            </select>
          </label>
          <label>Strictness
            <select value={options.strictness} onChange={(event) => setOptions({ ...options, strictness: event.target.value })}>
              <option value="lenient">Lenient</option>
              <option value="balanced">Balanced</option>
              <option value="strict">Strict</option>
            </select>
          </label>
          <label className="upload-button">
            Add files
            <input type="file" multiple onChange={addFiles} aria-label="Add files for review" />
          </label>
          <button type="button" className="reset-button" onClick={resetEditor}>Reset</button>
        </div>
        {(uploadedFiles.length > 0 || uploadProgress) && (
          <div className="uploaded-files" aria-live="polite">
            {uploadedFiles.map((file) => (
              <span className="file-chip" key={file.path}>
                {file.path}
                <button type="button" aria-label={`Remove ${file.path}`} onClick={() => setUploadedFiles(uploadedFiles.filter((item) => item.path !== file.path))}>×</button>
              </span>
            ))}
            {uploadProgress && <span>Reading files {uploadProgress.completed}/{uploadProgress.total}</span>}
            <span>{(totalBytes / 1024).toFixed(1)} KiB / 1024 KiB</span>
          </div>
        )}
        {uploadError && <p role="alert" className="upload-error">{uploadError}</p>}
        <div className="code" onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault()
            reviewCode()
          }
        }}>
          <Editor
            value={code}
            onValueChange={setCode}
            highlight={(value) => {
              if (options.language === 'other') return escapeHtml(value)
              try {
                return hljs.highlight(value, { language: options.language }).value
              } catch {
                return escapeHtml(value)
              }
            }}
            padding={10}
            style={{
              fontFamily: '"Fira code", "Fira Mono", monospace',
              fontSize: 16,
              border: '1px solid #ddd',
              borderRadius: '5px',
              height: '100%',
              width: '100%',
            }}
          />
        </div>
        <button onClick={reviewCode} className="review" disabled={reviewState.loading || Boolean(uploadProgress) || (!code.trim() && uploadedFiles.length === 0)}>
          {reviewState.loading ? 'Reviewing…' : 'Review code'}
        </button>
        <span className="shortcut-hint">Ctrl/⌘ + Enter to review</span>
      </div>
      <section className="right" aria-live="polite">
        {reviewState.error ? <p role="alert" className="error">{reviewState.error}</p> : reviewState.review
          ? <ReviewResults review={reviewState.review} copiedPatch={copiedPatch} onCopyPatch={copyPatch} />
          : <p className="placeholder">Your code review will appear here.</p>}
      </section>
    </main>
  )
}

function escapeHtml(value) {
  return value.replace(/[&<>]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[character])
}

function ReviewResults({ review, copiedPatch, onCopyPatch }) {
  if (!review || !Array.isArray(review.findings)) {
    return <p role="alert" className="error">The review server returned an invalid response. Please try again.</p>
  }

  const groups = severityOrder
    .map((severity) => ({ severity, findings: review.findings.filter((item) => item.severity === severity) }))
    .filter((group) => group.findings.length > 0)

  return (
    <div className="review-results">
      <p className="review-summary">{review.summary}</p>
      {groups.length === 0
        ? <p>No actionable findings.</p>
        : groups.map(({ severity, findings }) => (
          <section className="severity-group" key={severity}>
            <h2><span className={`severity-dot ${severity}`} />{severity} <span className="finding-count">{findings.length}</span></h2>
            {findings.map((finding, index) => {
              const key = `${severity}-${finding.file}-${finding.startLine}-${index}`
              const location = finding.startLine
                ? `${finding.file}:${finding.startLine}${finding.endLine && finding.endLine !== finding.startLine ? `–${finding.endLine}` : ''}`
                : finding.file
              return (
                <article className="finding" key={key}>
                  <p className="finding-location">{location}</p>
                  <h3>{finding.title}</h3>
                  <p>{finding.description}</p>
                  {finding.recommendation && <p><strong>Suggested fix:</strong> {finding.recommendation}</p>}
                  {finding.patch && (
                    <div className="patch-block">
                      <pre><code>{finding.patch}</code></pre>
                      <button type="button" onClick={() => onCopyPatch(finding.patch)}>
                        {copiedPatch === finding.patch ? 'Copied' : 'Copy patch'}
                      </button>
                    </div>
                  )}
                </article>
              )
            })}
          </section>
        ))}
    </div>
  )
}

ReviewResults.propTypes = {
  review: PropTypes.shape({
    summary: PropTypes.string,
    findings: PropTypes.arrayOf(PropTypes.shape({
      severity: PropTypes.string,
      title: PropTypes.string,
      file: PropTypes.string,
      startLine: PropTypes.number,
      endLine: PropTypes.number,
      description: PropTypes.string,
      recommendation: PropTypes.string,
      patch: PropTypes.string,
    })),
  }),
  copiedPatch: PropTypes.string,
  onCopyPatch: PropTypes.func.isRequired,
}

export default App
