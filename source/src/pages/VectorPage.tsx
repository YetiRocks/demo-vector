import { useState, useCallback, useEffect, useRef } from 'react'
import hljs from 'highlight.js/lib/core'
import json from 'highlight.js/lib/languages/json'
import { ARTICLES } from '../articles.ts'

hljs.registerLanguage('json', json)

const BASE_URL = window.location.origin + '/demo-vector'
const VECTOR_MODEL = 'BAAI/bge-small-en-v1.5'

let recordCounter = 0

function generateRecord() {
  const idx = recordCounter % ARTICLES.length
  recordCounter++
  const article = ARTICLES[idx]
  return {
    id: `article-${Date.now()}-${recordCounter}`,
    ...article,
  }
}

// Truncate embedding arrays for display
function truncateEmbeddings(obj: Record<string, unknown>): Record<string, unknown> {
  const result = { ...obj }
  if (Array.isArray(result.embedding) && result.embedding.length > 4) {
    const arr = result.embedding as number[]
    result.embedding = `[${arr.slice(0, 4).map(n => n.toFixed(4)).join(', ')}, ... (${arr.length} dims)]` as unknown
  }
  return result
}

// Highlighted code pane (read-only, fills its section)
function CodePane({ children, placeholder }: { children: string; placeholder?: string }) {
  const codeRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (codeRef.current && children) {
      codeRef.current.removeAttribute('data-highlighted')
      hljs.highlightElement(codeRef.current)
    }
  }, [children])

  if (!children) {
    return (
      <div className="code-pane code-pane-empty">
        <span className="empty-hint">{placeholder || 'No data'}</span>
      </div>
    )
  }

  return (
    <pre className="code-pane"><code ref={codeRef} className="language-json">{children}</code></pre>
  )
}

export function VectorPage() {
  // Insert panel state
  const [originalRecord, setOriginalRecord] = useState<string>('')
  const [insertedRecord, setInsertedRecord] = useState<string>('')
  const [insertLoading, setInsertLoading] = useState(false)
  const [recordCount, setRecordCount] = useState<number | null>(null)
  const [insertError, setInsertError] = useState<string>('')

  const fetchRecordCount = useCallback(async () => {
    try {
      const response = await fetch(`${BASE_URL}/Article/`)
      if (response.ok) {
        const records = await response.json() as unknown[]
        setRecordCount(records.length)
      }
    } catch { /* ignore */ }
  }, [])

  const [insertTime, setInsertTime] = useState<number | null>(null)

  // Delete modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)

  // Search panel state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<string>('')
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchTime, setSearchTime] = useState<number | null>(null)
  const [searchRequestJson, setSearchRequestJson] = useState<string>('')

  useEffect(() => { fetchRecordCount() }, [fetchRecordCount])

  const handleAddRecord = useCallback(async () => {
    setInsertLoading(true)
    setInsertError('')
    setInsertTime(null)
    const t0 = performance.now()
    try {
      const record = generateRecord()
      setOriginalRecord(JSON.stringify(record, null, 2))
      setInsertedRecord('')

      const response = await fetch(`${BASE_URL}/Article`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`HTTP ${response.status}: ${text}`)
      }

      // POST returns the ID -- fetch the full record to see the embedding
      const getResponse = await fetch(`${BASE_URL}/Article/${record.id}`)
      if (!getResponse.ok) {
        const text = await getResponse.text()
        throw new Error(`GET failed: HTTP ${getResponse.status}: ${text}`)
      }

      const data = await getResponse.json()
      const display = truncateEmbeddings(data)
      setInsertedRecord(JSON.stringify(display, null, 2))
      fetchRecordCount()
      setInsertTime(performance.now() - t0)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setInsertError(msg)
    } finally {
      setInsertLoading(false)
    }
  }, [fetchRecordCount])

  const handleDeleteAll = useCallback(async () => {
    setDeleteLoading(true)
    try {
      const response = await fetch(`${BASE_URL}/Article/`)
      if (!response.ok) throw new Error(`Failed to list: HTTP ${response.status}`)
      const records = await response.json() as Record<string, unknown>[]
      for (const record of records) {
        await fetch(`${BASE_URL}/Article/${record.id}`, { method: 'DELETE' })
      }
      setRecordCount(0)
      setOriginalRecord('')
      setInsertedRecord('')
      setInsertError('')
      setSearchResults('')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setInsertError(`Delete failed: ${msg}`)
    } finally {
      setDeleteLoading(false)
      setShowDeleteModal(false)
    }
  }, [])

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return
    setSearchLoading(true)
    setSearchResults('')
    setSearchTime(null)
    const t0 = performance.now()
    try {
      const queryObj = {
        conditions: [
          {
            field: 'embedding',
            op: 'vector',
            value: searchQuery,
          },
        ],
        limit: 10,
      }
      setSearchRequestJson(JSON.stringify({ table: 'Article', ...queryObj }, null, 2))
      const requestUrl = `${BASE_URL}/Article/?query=${encodeURIComponent(JSON.stringify(queryObj))}`
      const response = await fetch(requestUrl)

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`HTTP ${response.status}: ${text}`)
      }

      const data = await response.json() as Record<string, unknown>[]

      // Results come sorted by distance ascending from the server.
      // Keep $distance, remove embedding for readability.
      const results = data
        .map((item) => {
          const display = truncateEmbeddings(item)
          return display
        })

      setSearchResults(JSON.stringify(results, null, 2))
      setSearchTime(performance.now() - t0)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setSearchResults(`Error: ${msg}`)
    } finally {
      setSearchLoading(false)
    }
  }, [searchQuery])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch()
  }, [handleSearch])

  return (
    <>
        {/* Left Panel -- Insert Records */}
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">Insert Records</span>
            <div className="header-actions">
              <span className={`panel-badge ${recordCount ? 'success' : ''}`}>
                {recordCount === null ? '...' : `${recordCount} records`}
              </span>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleAddRecord}
                disabled={insertLoading}
              >
                {insertLoading ? 'Inserting...' : 'Add Record'}
              </button>
              <button
                className="btn btn-sm"
                onClick={() => setShowDeleteModal(true)}
                disabled={deleteLoading}
              >
                Delete All
              </button>
            </div>
          </div>
          {insertError && <div className="error-bar">{insertError}</div>}
          <div className="panel-header">
            <span className="panel-title">Original Record</span>
          </div>
          <CodePane placeholder='Click "Add Record" to generate an article'>{originalRecord}</CodePane>
          <div className="panel-header">
            <span className="panel-title">After Insert (with embedding)</span>
            {insertTime !== null && <span className="panel-badge">{(insertTime / 1000).toFixed(2)}s</span>}
          </div>
          <CodePane placeholder={insertLoading ? 'Embedding and inserting...' : 'The server response will appear here'}>{insertedRecord}</CodePane>
        </div>

        {/* Right Panel -- Vector Search */}
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">Vector Search</span>
            <div className="header-actions">
              <span className="panel-badge">{VECTOR_MODEL}</span>
              <input
                type="text"
                className="search-input"
                placeholder="Enter search text..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <button
                className="btn btn-primary btn-sm"
                onClick={handleSearch}
                disabled={searchLoading || !searchQuery.trim()}
              >
                {searchLoading ? 'Searching...' : 'Search'}
              </button>
            </div>
          </div>
          <div className="panel-header">
            <span className="panel-title">Request</span>
          </div>
          <CodePane placeholder="The search query will appear here">{searchRequestJson}</CodePane>
          <div className="panel-header">
            <span className="panel-title">Results (nearest first)</span>
            {searchTime !== null && <span className="panel-badge">{(searchTime / 1000).toFixed(2)}s</span>}
          </div>
          <CodePane placeholder="Insert some records, then search by meaning using natural language">
            {searchResults.startsWith('Error') ? '' : searchResults}
          </CodePane>
          {searchResults.startsWith('Error') && <div className="error-bar">{searchResults}</div>}
        </div>

      {showDeleteModal && (
        <div className="modal-overlay" onClick={() => setShowDeleteModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Delete All Records?</h2>
            <p className="modal-message">
              This will permanently delete all Article records. This action cannot be undone.
            </p>
            <div className="modal-actions">
              <button onClick={() => setShowDeleteModal(false)} className="btn btn-cancel">Cancel</button>
              <button onClick={handleDeleteAll} className="btn btn-primary" disabled={deleteLoading}>
                {deleteLoading ? 'Deleting...' : 'Delete All'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
