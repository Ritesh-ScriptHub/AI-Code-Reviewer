export const initialReviewState = {
  review: null,
  error: '',
  loading: false,
}

export function reviewReducer(state, action) {
  switch (action.type) {
    case 'start':
      return { review: null, error: '', loading: true }
    case 'success':
      return { review: action.review, error: '', loading: false }
    case 'failure':
      return { review: null, error: action.message, loading: false }
    case 'reset':
      return initialReviewState
    default:
      return state
  }
}

export function reviewErrorMessage(error) {
  if (error.code === 'ECONNABORTED') {
    return 'The review request timed out. Try again with fewer or smaller files.'
  }
  const body = error.response?.data
  if (typeof body === 'string' && body.trim()) return body
  if (error.response) {
    return `The review server returned HTTP ${error.response.status}. Check the backend logs for details.`
  }
  return 'Could not reach the review server. Make sure the backend is running.'
}
