import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { addFilesToReview, MAX_FILE_BYTES, MAX_FILES, MAX_TOTAL_BYTES } from '../src/file-uploads.js'

function fakeFile(name, content) {
  return { name, size: new TextEncoder().encode(content).length, text: async () => content }
}

describe('file upload handling', () => {
  it('reads multiple selected files and reports progress', async () => {
    const progress = []
    const result = await addFilesToReview([fakeFile('a.js', 'const a = 1'), fakeFile('b.js', 'const b = 2')], {
      code: '',
      onProgress: (state) => progress.push(state),
    })
    assert.deepEqual(result.files.map(({ path }) => path), ['a.js', 'b.js'])
    assert.equal(result.files[1].content, 'const b = 2')
    assert.deepEqual(progress, [{ completed: 0, total: 2 }, { completed: 1, total: 2 }, { completed: 2, total: 2 }])
    assert.deepEqual(result.errors, [])
  })

  it('skips oversized, empty, and duplicate files while preserving valid files', async () => {
    const result = await addFilesToReview([
      fakeFile('duplicate.js', 'replacement'),
      fakeFile('large.js', 'x'.repeat(MAX_FILE_BYTES + 1)),
      fakeFile('empty.js', '  '),
      fakeFile('good.js', 'const good = true'),
    ], { existingFiles: [{ path: 'duplicate.js', content: 'existing', size: 8 }], code: '' })
    assert.deepEqual(result.files.map(({ path }) => path), ['duplicate.js', 'good.js'])
    assert.equal(result.errors.length, 3)
  })

  it('rejects selections that exceed the file count or combined content limit', async () => {
    const tooMany = await addFilesToReview(Array.from({ length: MAX_FILES }, (_, i) => fakeFile(`${i}.js`, 'x')), { code: 'editor code' })
    assert.equal(tooMany.files.length, 0)
    assert.match(tooMany.errors[0], /up to 10 files/)

    const totalTooLarge = await addFilesToReview([fakeFile('large-total.js', 'x'.repeat(200 * 1024))], {
      code: 'x'.repeat(MAX_TOTAL_BYTES - 100),
    })
    assert.equal(totalTooLarge.files.length, 0)
    assert.match(totalTooLarge.errors[0], /Combined file content/)
  })
})
