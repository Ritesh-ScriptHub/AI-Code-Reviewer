export const MAX_FILES = 10
export const MAX_FILE_BYTES = 256 * 1024
export const MAX_TOTAL_BYTES = 1024 * 1024

export async function addFilesToReview(selectedFiles, {
  existingFiles = [],
  code = '',
  onProgress = () => {},
} = {}) {
  const hasCode = Boolean(code.trim())
  const availableCount = MAX_FILES - existingFiles.length - (hasCode ? 1 : 0)
  if (selectedFiles.length > availableCount) {
    return { files: existingFiles, errors: [`You can include up to ${MAX_FILES} files total, counting the editor code.`] }
  }

  let totalBytes = (hasCode ? new TextEncoder().encode(code).length : 0)
    + existingFiles.reduce((sum, file) => sum + file.size, 0)
  const files = [...existingFiles]
  const errors = []
  onProgress({ completed: 0, total: selectedFiles.length })

  for (const [index, file] of selectedFiles.entries()) {
    if (file.size > MAX_FILE_BYTES) {
      errors.push(`${file.name} is larger than the 256 KiB per-file limit.`)
    } else if (files.some((item) => item.path === file.name)) {
      errors.push(`${file.name} is already in the review.`)
    } else {
      try {
        const content = await file.text()
        const contentBytes = new TextEncoder().encode(content).length
        if (contentBytes > MAX_FILE_BYTES) {
          errors.push(`${file.name} is larger than the 256 KiB per-file limit.`)
        } else if (totalBytes + contentBytes > MAX_TOTAL_BYTES) {
          errors.push('Combined file content must be 1 MiB or smaller.')
        } else if (!content.trim()) {
          errors.push(`${file.name} is empty and was skipped.`)
        } else {
          totalBytes += contentBytes
          files.push({ path: file.name, content, size: contentBytes })
        }
      } catch {
        errors.push(`Could not read ${file.name}.`)
      }
    }
    onProgress({ completed: index + 1, total: selectedFiles.length })
  }

  return { files, errors }
}
