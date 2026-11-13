import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { initialReviewState, reviewErrorMessage, reviewReducer } from '../src/review-state.js'

describe('review UI state', () => {
  it('enters loading state and clears stale results when a review starts', () => {
    const state = reviewReducer({ ...initialReviewState, review: { summary: 'old' }, error: 'old error' }, { type: 'start' })
    assert.deepEqual(state, { review: null, error: '', loading: true })
  })

  it('stores a completed review and exits loading state', () => {
    const review = { summary: 'Looks good', findings: [] }
    assert.deepEqual(reviewReducer({ ...initialReviewState, loading: true }, { type: 'success', review }), {
      review, error: '', loading: false,
    })
  })

  it('shows API errors, timeout errors, and unreachable-server errors distinctly', () => {
    assert.equal(reviewErrorMessage({ response: { status: 503, data: 'Gemini is temporarily unavailable.' } }), 'Gemini is temporarily unavailable.')
    assert.match(reviewErrorMessage({ code: 'ECONNABORTED' }), /timed out/)
    assert.match(reviewErrorMessage({ request: {} }), /Could not reach the review server/)
  })

  it('exits loading state when a request fails', () => {
    assert.deepEqual(reviewReducer({ ...initialReviewState, loading: true }, { type: 'failure', message: 'API unavailable' }), {
      review: null, error: 'API unavailable', loading: false,
    })
  })

  it('clears review and error state when the editor is reset', () => {
    assert.deepEqual(reviewReducer({ review: { summary: 'old' }, error: 'old error', loading: true }, { type: 'reset' }), initialReviewState)
  })
})
