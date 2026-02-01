# RAG Clip

Multi-format personal RAG with user auth, hybrid search, and clean article extraction.

## Setup

```bash
npm install
export OPENAI_API_KEY=your_key
export JWT_SECRET=your_secret
```

## Run

```bash
npm run server
# Visit http://localhost:3000
```

## Features

- **User Auth**: Sign up/login with JWT
- **File Upload**: Drag & drop PDF, DOCX, Excel, images
- **Web Pages**: Auto-fetch with Readability.js for clean extraction
- **OCR**: Extract text from images (Tesseract)
- **Hybrid Search**: Semantic (vector) + keyword (BM25) search
- **Filters**: By content type and date range
- **MCP Server**: Query via Kiro CLI

## Supported Formats

- PDF → text extraction
- DOCX → text extraction  
- Excel → sheet to text
- Images → OCR text
- Web pages → clean article extraction (Readability.js)

## Search Modes

- **Semantic**: Vector similarity search (best for concepts)
- **Keyword**: BM25 full-text search (best for exact terms)
- **Hybrid**: Combined scoring (default, best overall)

## MCP Config

Add to `~/.config/kiro-cli/mcp.json`:

```json
{
  "mcpServers": {
    "rag-clip": {
      "command": "node",
      "args": ["/Users/drewstoneburger/person-repo/rag-clip/src/mcp-server.js"],
      "env": {
        "OPENAI_API_KEY": "your_key"
      }
    }
  }
}
```

Query examples:
```javascript
// Basic search
search_saved_content(query="machine learning", userId=1)

// Keyword only
search_saved_content(query="exact phrase", userId=1, mode="keyword")

// Filter by type
search_saved_content(query="python", userId=1, type="pdf")

// Filter by date
search_saved_content(query="news", userId=1, startDate="2026-01-01")
```
