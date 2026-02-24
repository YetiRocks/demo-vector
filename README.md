<p align="center">
  <img src="https://cdn.prod.website-files.com/68e09cef90d613c94c3671c0/697e805a9246c7e090054706_logo_horizontal_grey.png" alt="Yeti" width="200" />
</p>

---

# demo-vector

[![Yeti](https://img.shields.io/badge/Yeti-Application-blue)](https://yetirocks.com)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

> **[Yeti](https://yetirocks.com)** — The Performance Platform for Agent-Driven Development.
> Schema-driven APIs, real-time streaming, and vector search. From prompt to production.

Automatic text-to-vector embedding with HNSW nearest-neighbor semantic search. Add articles, then search by natural language.

## Features

- `Vector` type with auto-embedding on insert
- HNSW similarity search via `?query=` JSON
- Embedding cache for fast re-indexing
- Schema-declared model configuration

## Installation

```bash
cd ~/yeti/applications
git clone https://github.com/yetirocks/demo-vector.git
cd demo-vector/source
npm install
npm run build
```

## Project Structure

```
demo-vector/
├── config.yaml              # App configuration
├── schemas/
│   └── vector.graphql       # Article with Vector field
└── source/                  # React/Vite frontend
    ├── index.html
    ├── package.json
    ├── vite.config.ts
    └── src/
```

## Configuration

```yaml
name: "Vector Search Demo"
app_id: "demo-vector"
version: "1.0.0"
description: "Automatic text-to-vector embedding with HNSW nearest-neighbor semantic search"
enabled: true
rest: true
graphql: true

schemas:
  - schemas/vector.graphql

static_files:
  path: web
  route: /
  index: index.html
  notFound:
    file: index.html
    statusCode: 200
  build:
    sourceDir: source
    command: npm run build

extensions:
  - yeti-vectors
```

## Schema

**vector.graphql** -- Article with auto-embedded Vector field:
```graphql
type Article @table(database: "demo-vector") @export {
    id: ID! @primaryKey
    title: String!
    author: String!
    category: String!
    tags: String
    content: String!
    embedding: Vector @indexed(source: "content", model: "BAAI/bge-small-en-v1.5")
}
```

The `embedding` field uses the `Vector` type with `@indexed` to automatically generate embeddings from the `content` field using the `BAAI/bge-small-en-v1.5` model. The `yeti-vectors` extension handles embedding generation and HNSW index management.

## Development

```bash
cd source

# Install dependencies
npm install

# Start dev server with HMR
npm run dev

# Build for production
npm run build
```

---

Built with [Yeti](https://yetirocks.com) | The Performance Platform for Agent-Driven Development
