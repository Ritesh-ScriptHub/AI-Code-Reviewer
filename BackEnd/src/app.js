const express = require('express');
const aiRoutes = require('./routes/ai.routes')
const cors = require('cors')
const createReviewRateLimiter = require('./middleware/review-rate-limit')

const app = express()

const allowedOrigins = ['http://localhost:5173', ...(process.env.FRONTEND_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)]

app.use(cors({
    origin(origin, callback) {
        // Allow non-browser clients and the configured frontend origins.
        callback(null, !origin || allowedOrigins.includes(origin))
    },
}))


app.use('/ai/get-review', createReviewRateLimiter({ limit: 10, windowMs: 60_000 }))
app.use(express.json({ limit: '2.2mb' }))

app.get('/', (req, res) => {
    res.send('Hello World')
})

app.use('/ai', aiRoutes)

app.use((error, req, res, next) => {
    if (error.type === 'entity.too.large') {
        return res.status(413).send('Request body is too large. Review input supports up to 1 MiB of code across 10 files.');
    }
    if (error.type === 'entity.parse.failed') {
        return res.status(400).send('Request body must be valid JSON.');
    }
    next(error)
})

module.exports = app
