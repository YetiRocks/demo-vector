import { useState, useCallback, useEffect, useRef } from 'react'
import hljs from 'highlight.js/lib/core'
import json from 'highlight.js/lib/languages/json'
import graphql from 'highlight.js/lib/languages/graphql'
import { ARTICLES } from '../articles.ts'

hljs.registerLanguage('json', json)
hljs.registerLanguage('graphql', graphql)

const VECTOR_MODEL = 'BAAI/bge-small-en-v1.5'
const MAX_SSE_ITEMS = 20

const SCHEMA_GRAPHQL = `# Vector Search Demo Schema

type Article @table(database: "demo-vector") @export(public: [read, create, delete]) {
    id: ID! @primaryKey
    title: String!
    author: String!
    category: String!
    tags: String
    content: String!
    embedding: Vector @indexed(source: "content", model: "BAAI/bge-small-en-v1.5")
}`

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
    result.embedding = [...arr.slice(0, 4).map(n => parseFloat(n.toFixed(4))), `... ${arr.length} dims`] as unknown
  }
  return result
}

// Collapse "embedding" arrays onto a single line in pretty-printed JSON
function collapseEmbeddings(json: string): string {
  return json.replace(/"embedding": \[\s*([\s\S]*?)\s*\]/g, (_, inner) => {
    const collapsed = inner.replace(/\s*\n\s*/g, ' ').trim()
    return `"embedding": [${collapsed}]`
  })
}

// Highlighted code pane (read-only, fills its section)
function CodePane({ children, placeholder, language = 'json' }: { children: string; placeholder?: string; language?: string }) {
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
    <pre className="code-pane"><code ref={codeRef} className={`language-${language}`}>{children}</code></pre>
  )
}

interface SseArticle {
  id: string
  [key: string]: unknown
}

export function VectorPage() {
  // Insert panel state
  const [insertLoading, setInsertLoading] = useState(false)
  const [recordCount, setRecordCount] = useState<number | null>(null)
  const [insertError, setInsertError] = useState<string>('')
  const [insertTime, setInsertTime] = useState<number | null>(null)

  // SSE stream state
  const [sseArticles, setSseArticles] = useState<SseArticle[]>([])
  const [sseConnected, setSseConnected] = useState(false)
  const eventSourceRef = useRef<EventSource | null>(null)

  const fetchRecordCount = useCallback(async () => {
    try {
      const response = await fetch(`${__STATIC_ROOT__}/${__RESOURCES_ROOT__}/Article/`)
      if (response.ok) {
        const records = await response.json() as unknown[]
        setRecordCount(records.length)
      }
    } catch { /* ignore */ }
  }, [])

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

  // SSE subscription — listens for enriched articles arriving from the WAL consumer
  useEffect(() => {
    let es: EventSource | null = null
    let retryTimeout: ReturnType<typeof setTimeout> | null = null
    let retryDelay = 1000

    function connect() {
      es = new EventSource(`${__STATIC_ROOT__}/${__RESOURCES_ROOT__}/Article/`)
      eventSourceRef.current = es

      es.onopen = () => {
        setSseConnected(true)
        retryDelay = 1000 // reset backoff on success
      }

      es.addEventListener('update', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data) as SseArticle
          setSseArticles(prev => {
            // Deduplicate by id (consumer may re-send on retry)
            const filtered = prev.filter(a => a.id !== data.id)
            return [data, ...filtered].slice(0, MAX_SSE_ITEMS)
          })
          setRecordCount(c => c !== null ? c + 1 : 1)
        } catch { /* ignore malformed */ }
      })

      es.addEventListener('delete', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data)
          if (data.id) {
            setSseArticles(prev => prev.filter(a => a.id !== data.id))
          }
        } catch { /* ignore */ }
      })

      es.onerror = () => {
        setSseConnected(false)
        es?.close()
        eventSourceRef.current = null
        // Exponential backoff reconnect (max 10s)
        retryTimeout = setTimeout(() => {
          retryDelay = Math.min(retryDelay * 2, 10000)
          connect()
        }, retryDelay)
      }
    }

    connect()

    return () => {
      if (retryTimeout) clearTimeout(retryTimeout)
      es?.close()
      eventSourceRef.current = null
    }
  }, [])

  const handleAddRecord = useCallback(async () => {
    setInsertLoading(true)
    setInsertError('')
    setInsertTime(null)
    const t0 = performance.now()
    try {
      const record = generateRecord()

      const response = await fetch(`${__STATIC_ROOT__}/${__RESOURCES_ROOT__}/Article`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`HTTP ${response.status}: ${text}`)
      }

      setInsertTime(performance.now() - t0)
      // Don't need to re-fetch count — SSE update event will increment it
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setInsertError(msg)
    } finally {
      setInsertLoading(false)
    }
  }, [])

  const handleDeleteAll = useCallback(async () => {
    setDeleteLoading(true)
    try {
      // DELETE /Article/ (no ID) — collection-level truncate (single request)
      const response = await fetch(`${__STATIC_ROOT__}/${__RESOURCES_ROOT__}/Article/`, { method: 'DELETE' })
      if (!response.ok) {
        const text = await response.text()
        throw new Error(`HTTP ${response.status}: ${text}`)
      }
      setRecordCount(0)
      setSseArticles([])
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
      const requestUrl = `${__STATIC_ROOT__}/${__RESOURCES_ROOT__}/Article/?query=${encodeURIComponent(JSON.stringify(queryObj))}`
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

      setSearchResults(collapseEmbeddings(JSON.stringify(results, null, 2)))
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

  // Format SSE articles for display
  const sseDisplay = sseArticles.length > 0
    ? collapseEmbeddings(JSON.stringify(sseArticles.map(truncateEmbeddings), null, 2))
    : ''

  return (
    <>
        {/* Left Panel -- Insert Records */}
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">Insert Records ({recordCount === null ? '...' : recordCount})</span>
            <div className="header-actions">
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
            <span className="panel-title">Table Schema</span>
            {insertTime !== null && <span className="panel-badge">{(insertTime / 1000).toFixed(2)}s</span>}
          </div>
          <CodePane language="graphql">{SCHEMA_GRAPHQL}</CodePane>
          <div className="panel-header">
            <span className="panel-title">Live Stream (enriched via SSE)</span>
            <span className={`status-dot ${sseConnected ? 'connected' : 'disconnected'}`}></span>
          </div>
          <CodePane placeholder="Enriched articles with embeddings will appear here via SSE as the WAL consumer processes them">{sseDisplay}</CodePane>
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
