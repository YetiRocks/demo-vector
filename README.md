<p align="center">
  <img src="https://cdn.prod.website-files.com/68e09cef90d613c94c3671c0/697e805a9246c7e090054706_logo_horizontal_grey.png" alt="Yeti" width="200" />
</p>

---

# demo-vector

[![Yeti](https://img.shields.io/badge/Yeti-Demo-blue)](https://yetirocks.com/demo-vector)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

> **[Yeti](https://yetirocks.com)** - The Performance Platform for Agent-Driven Development.
> Schema-driven APIs, real-time streaming, and vector search. From prompt to production.

**Semantic search in one schema file.** Add articles, search by meaning, stream updates in real-time.

Demo-vector shows how a single `Vector` field in a GraphQL schema gives you automatic text-to-vector embedding, HNSW nearest-neighbor search, and SSE streaming with zero custom backend code. Drop in 100 diverse articles spanning science, history, cooking, and engineering, then search by natural language. "Storage engine tradeoffs" finds the database article. "Baking temperature control" finds the French pastry article. No keyword matching -- pure semantic similarity powered by local ONNX models.

---

## Why demo-vector

Building semantic search typically means deploying a vector database, an embedding service, a REST API layer, and a frontend -- four moving parts, each with its own configuration and failure modes. Most tutorials skip the hard parts: index management, real-time updates, embedding lifecycle.

Demo-vector collapses all of that into a single schema declaration:

- **Zero backend code** -- no Rust resources, no custom endpoints. The entire API is auto-generated from one `.graphql` file. The `Vector` type and `@indexed` directive do all the work.
- **Automatic embedding on write** -- POST an article with plain text content and the `yeti-vectors` extension generates a 384-dimensional embedding via `BAAI/bge-small-en-v1.5` before the record hits storage.
- **HNSW vector indexing** -- cosine similarity search built into the table layer. Sub-millisecond nearest-neighbor queries on native Rust HNSW indexes.
- **Real-time SSE streaming** -- the `@export` directive gives you server-sent events for free. The React frontend subscribes and displays enriched articles (with embeddings) as they arrive.
- **100 sample articles** -- a curated dataset spanning machine learning, French pastry, volcanic geology, jazz theory, coral reef biology, Renaissance architecture, and 94 more topics for meaningful semantic search demonstrations.
- **Interactive React UI** -- insert articles, watch them stream back with embeddings via SSE, and search by natural language with highlighted JSON results.
- **Fully offline** -- all embedding models run locally via ONNX. No API keys, no external calls, no internet required.

---

## Quick Start

### 1. Install

```bash
cd ~/yeti/applications
git clone https://github.com/yetirocks/demo-vector.git
```

Restart yeti. The frontend builds automatically on first load via `npm run build`.

### 2. Insert an article

```bash
curl -X POST https://localhost/demo-vector/Article \
  -H "Content-Type: application/json" \
  -d '{
    "id": "article-1",
    "title": "Introduction to Machine Learning",
    "author": "Alice Chen",
    "category": "Technology",
    "tags": "beginner,ai,tutorial",
    "content": "Machine learning is a branch of artificial intelligence that focuses on building systems that learn from data."
  }'
```

Response:
```json
{
  "id": "article-1",
  "title": "Introduction to Machine Learning",
  "author": "Alice Chen",
  "category": "Technology",
  "tags": "beginner,ai,tutorial",
  "content": "Machine learning is a branch of artificial intelligence...",
  "embedding": [0.0234, -0.0891, 0.0412, 0.0567, "... 384 dims"]
}
```

The `embedding` field is automatically generated from the `content` field using `BAAI/bge-small-en-v1.5`. No separate embedding call required.

### 3. Search by meaning

```bash
curl "https://localhost/demo-vector/Article/?query=%7B%22conditions%22%3A%5B%7B%22field%22%3A%22embedding%22%2C%22op%22%3A%22vector%22%2C%22value%22%3A%22neural%20network%20training%22%7D%5D%2C%22limit%22%3A5%7D"
```

The query JSON (URL-decoded):
```json
{
  "conditions": [
    { "field": "embedding", "op": "vector", "value": "neural network training" }
  ],
  "limit": 5
}
```

Response (ranked by similarity, nearest first):
```json
[
  {
    "id": "article-1",
    "title": "Introduction to Machine Learning",
    "author": "Alice Chen",
    "category": "Technology",
    "content": "Machine learning is a branch of artificial intelligence...",
    "$distance": 0.234,
    "embedding": [0.0234, -0.0891, "... 384 dims"]
  }
]
```

The search text "neural network training" is embedded on the fly and compared against all stored article embeddings via HNSW cosine similarity. Results include a `$distance` field (lower is more similar).

### 4. Stream updates in real-time

```bash
# SSE stream -- receive enriched articles as they are inserted
curl -N "https://localhost/demo-vector/Article/"
```

Output (server-sent events):
```
event: update
data: {"id":"article-2","title":"The Art of French Pastry","author":"Pierre Dubois",...,"embedding":[...]}

event: update
data: {"id":"article-3","title":"Volcanic Activity on Io","author":"Maria Santos",...,"embedding":[...]}
```

### 5. List all articles

```bash
curl "https://localhost/demo-vector/Article/?limit=10"
```

### 6. Delete an article

```bash
curl -X DELETE "https://localhost/demo-vector/Article/article-1"
```

### 7. Open the web UI

Navigate to `https://localhost/demo-vector/` in your browser. The React frontend provides:
- One-click article insertion from 100 sample articles
- Live SSE stream showing enriched articles with truncated embeddings
- Natural language search with syntax-highlighted JSON results
- Timing information for inserts and searches
- Delete all records with confirmation modal

---

## Architecture

```
Browser (React/Vite)                      CLI / Agents
    |                                         |
    +-- POST /Article ----------------------->+
    +-- GET  /Article/?query={vector} ------->+
    +-- SSE  /Article/ ---------------------->+
    |                                         |
    v                                         v
+----------------------------------------------------------+
|                      demo-vector                          |
|                                                           |
|  config.yaml ---- schemas/vector.graphql                  |
|                       |                                   |
|                       v                                   |
|              Article table (auto-generated)                |
|              +-----------------------------------+        |
|              | id | title | author | category    |        |
|              | tags | content | embedding (384d)  |        |
|              +-----------------------------------+        |
|                       |                                   |
|                       v                                   |
|              yeti-vectors extension                        |
|              +-----------------------------------+        |
|              | BAAI/bge-small-en-v1.5 (ONNX)    |        |
|              | Auto-embed on write               |        |
|              | HNSW index (cosine similarity)    |        |
|              +-----------------------------------+        |
|                                                           |
+----------------------------------------------------------+
    |
    v
Yeti (embedded RocksDB, native HNSW, SSE broadcast)
```

**Write path:** POST article -> yeti-vectors intercepts `Vector` field -> embeds `content` via ONNX model -> stores record + embedding in RocksDB -> updates HNSW index -> broadcasts via SSE.

**Read path:** Query with `"op": "vector"` -> embeds query text on the fly -> HNSW nearest-neighbor search -> returns results ranked by cosine distance.

**No custom backend code.** The entire application is one schema file and a React frontend. All REST endpoints, SSE streaming, vector embedding, and HNSW indexing are provided by the platform.

---

## Features

### Auto-Embedding on Write

The `Vector` type with `@indexed(source: "content")` tells yeti to automatically generate an embedding from the `content` field whenever a record is created or updated. The embedding model is specified in the schema directive:

```graphql
embedding: Vector @indexed(source: "content", model: "BAAI/bge-small-en-v1.5")
```

No API calls to OpenAI or other services. The `BAAI/bge-small-en-v1.5` model runs locally via ONNX runtime, producing 384-dimensional vectors optimized for cosine similarity.

### HNSW Vector Search

Yeti maintains an in-memory HNSW (Hierarchical Navigable Small World) index for each `@indexed` Vector field. Search queries embed the input text using the same model and return results ranked by cosine distance:

```bash
# Find articles about space exploration
GET /demo-vector/Article/?query={"conditions":[{"field":"embedding","op":"vector","value":"space exploration rockets"}],"limit":5}

# Find articles about food science
GET /demo-vector/Article/?query={"conditions":[{"field":"embedding","op":"vector","value":"fermentation and microbiology"}],"limit":5}
```

The `$distance` field in results indicates similarity (lower = more similar). Typical distances range from 0.1 (very similar) to 1.0+ (unrelated).

### Real-Time SSE Streaming

The `@export` directive on the Article table enables server-sent events. The React frontend subscribes to the SSE endpoint and displays articles as they arrive, complete with their generated embeddings:

- **`update` events** fire when articles are inserted or modified
- **`delete` events** fire when articles are removed
- Automatic reconnection with exponential backoff (1s to 10s)

### Public Access Control

The schema declares public access for read, create, and delete operations:

```graphql
@export(public: [read, create, delete])
```

This means the demo works without authentication in both development and production modes. Write operations (POST, DELETE) are open, making it suitable for demonstration purposes.

### 100 Sample Articles

The frontend includes a curated dataset of 100 articles across diverse topics, making semantic search demonstrations meaningful:

| Category Range | Topics |
|---------------|--------|
| General Knowledge | Machine learning, French pastry, volcanic geology, Silk Road history, jazz improvisation |
| Earth Sciences | Plate tectonics, water cycle, rainforest ecosystems, glaciology, soil science |
| Technology | Cryptographic hashing, CPU architecture, database indexing, quantum computing, distributed consensus |
| Life Sciences | mRNA vaccines, photosynthesis, human microbiome, CRISPR, neuroscience of memory |
| Arts & Humanities | Golden ratio, typography, wabi-sabi, film noir, Sanskrit linguistics |
| Engineering | Nuclear reactors, bridge engineering, aerodynamics, rocket propulsion, optical fiber |
| Interdisciplinary | Sleep science, cheese making, map projections, origami math, game theory |

Each article has structured fields (title, author, category, tags) plus long-form content that produces meaningful vector embeddings.

### Interactive React Frontend

The web UI at `/demo-vector/` provides a two-panel layout:

**Left panel -- Insert & Stream:**
- "Add Record" button cycles through 100 sample articles
- "Delete All" with confirmation modal
- Inline schema display with GraphQL syntax highlighting
- Live SSE stream showing enriched articles with truncated embedding arrays

**Right panel -- Vector Search:**
- Natural language search input with Enter key support
- Request JSON display showing the exact query sent
- Results with syntax-highlighted JSON, similarity distances, and timing
- Model badge showing `BAAI/bge-small-en-v1.5`

---

## Data Model

### Article Table

| Field | Type | Directives | Description |
|-------|------|-----------|-------------|
| `id` | ID! | @primaryKey | Unique article identifier |
| `title` | String! | -- | Article title |
| `author` | String! | -- | Author name |
| `category` | String! | -- | Topic category |
| `tags` | String | -- | Comma-separated tags |
| `content` | String! | -- | Full article text (embedding source) |
| `embedding` | Vector | @indexed(source: "content", model: "BAAI/bge-small-en-v1.5") | 384-dimensional auto-generated embedding |

### Schema

```graphql
type Article @table(database: "demo-vector") @export(public: [read, create, delete]) {
    id: ID! @primaryKey
    title: String!
    author: String!
    category: String!
    tags: String
    content: String!
    embedding: Vector @indexed(source: "content", model: "BAAI/bge-small-en-v1.5")
}
```

**Key directives:**
- `@table(database: "demo-vector")` -- stores records in a dedicated RocksDB database
- `@export(public: [read, create, delete])` -- generates REST + SSE endpoints with public access
- `@primaryKey` -- designates `id` as the record key
- `@indexed(source: "content", model: "...")` -- auto-embeds the `content` field using the specified model

---

## Configuration

### config.yaml

```yaml
name: "Vector Search Demo"
app_id: "demo-vector"
version: "1.0.0"
description: "Automatic text-to-vector embedding with HNSW nearest-neighbor semantic search"
schemas:
  path: schemas/vector.graphql

static:
  path: web
  route: /
  spa: true
  build:
    source: source
    command: npm run build
```

| Field | Value | Description |
|-------|-------|-------------|
| `app_id` | demo-vector | URL prefix for all endpoints |
| `schemas` | schemas/vector.graphql | Single schema defining the Article table |
| `static_files.path` | web | Built frontend served at `/demo-vector/` |
| `static_files.spa` | true | SPA mode -- all routes fall back to index.html |
| `static_files.build` | npm run build | Auto-builds from `source/` on first load |

### Embedding Models

The default model `BAAI/bge-small-en-v1.5` is downloaded automatically on first use by the `yeti-vectors` extension. To manage available models:

```bash
# List available models
GET /yeti-vectors/models

# Download a different model
POST /yeti-vectors/models
{ "model": "BAAI/bge-base-en-v1.5" }
```

Supported local embedding models:

| Model | Dimensions | Notes |
|-------|-----------|-------|
| **BAAI/bge-small-en-v1.5** | 384 | **Default.** Fast, good quality. Used by this demo. |
| BAAI/bge-base-en-v1.5 | 768 | Higher quality, larger index. |
| BAAI/bge-large-en-v1.5 | 1024 | Best quality, heaviest. |
| sentence-transformers/all-MiniLM-L6-v2 | 384 | Popular alternative. |
| Xenova/jina-embeddings-v2-small-en | 512 | Good for short text. |

All models run locally via ONNX. No API keys, no external calls, no internet required.

---

## REST Endpoints (auto-generated)

All endpoints are auto-generated from the schema. No custom resources exist.

| Endpoint | Methods | Description |
|----------|---------|-------------|
| `/demo-vector/Article` | GET, POST | List articles (with optional vector query) or create a new article |
| `/demo-vector/Article/{id}` | GET, PUT, DELETE | Read, update, or delete a single article |
| `/demo-vector/Article/` | GET (SSE) | Server-sent events stream for real-time updates |

### Query Parameters

| Parameter | Example | Description |
|-----------|---------|-------------|
| `query` | `{"conditions":[{"field":"embedding","op":"vector","value":"search text"}],"limit":10}` | Vector similarity search |
| `limit` | `20` | Maximum number of results |

---

## Project Structure

```
demo-vector/
├── config.yaml                    # App configuration
├── schemas/
│   └── vector.graphql             # Article table with Vector field
├── source/                        # React/Vite frontend
│   ├── package.json               # Dependencies: React 18, highlight.js, Vite 5
│   ├── vite.config.ts             # Auto-reads base path from config.yaml
│   ├── tsconfig.json
│   └── src/
│       ├── main.tsx               # React entry point
│       ├── App.tsx                 # App shell with nav and footer
│       ├── articles.ts            # 100 sample articles dataset
│       ├── utils.ts               # JSON syntax highlighting utility
│       ├── theme.ts               # Theme configuration
│       ├── index.css              # Global styles
│       ├── yeti.css               # Yeti design system styles
│       ├── auth.css               # Auth component styles
│       ├── pages/
│       │   └── VectorPage.tsx     # Main two-panel search interface
│       └── components/
│           └── Footer.tsx         # App footer
└── web/                           # Built output (auto-generated)
```

---

## Development

```bash
cd ~/yeti/applications/demo-vector/source

# Install dependencies
npm install

# Start dev server with HMR (port 5180)
npm run dev

# Build for production (outputs to ../web/)
npm run build
```

The Vite config automatically reads `app_id` from `config.yaml` to set the correct base path, so built assets resolve correctly when served by yeti at `/demo-vector/`.

---

## Comparison

| | demo-vector | Traditional Vector Search Setup |
|---|---|---|
| **Backend code** | None -- schema only | REST API + embedding pipeline + index management |
| **Embedding** | Automatic on write, local ONNX | External API calls (OpenAI, Cohere), API keys, latency |
| **Vector index** | Built-in HNSW from schema directive | Separate vector DB (Pinecone, Qdrant, Weaviate) |
| **Real-time** | SSE from `@export`, zero config | Custom WebSocket server or polling |
| **Search API** | Auto-generated query parameter | Custom endpoint, query parsing, result formatting |
| **Configuration** | One `.graphql` file, 7 lines | Vector DB config + embedding service config + API config |
| **Deployment** | Loads with yeti, no separate services | Docker compose with 3-4 containers |
| **Offline** | Fully functional, local ONNX models | Requires cloud API connectivity |
| **Frontend** | Included React app with live demo | Build your own |

---

Built with [Yeti](https://yetirocks.com) | The Performance Platform for Agent-Driven Development
