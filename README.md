# RAG Clip

Multi-format personal RAG with user auth. Save webpages, PDFs, DOCX, Excel, images.

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
- **Web Pages**: Save URL + content
- **OCR**: Extract text from images (Tesseract)
- **MCP Server**: Query via Kiro CLI

## Supported Formats

- PDF → text extraction
- DOCX → text extraction  
- Excel → sheet to text
- Images → OCR text
- Web pages → raw content

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

Query with: `search_saved_content(query="your search", userId=1)`

## Browser Extension

Update `extension/popup.js` to include auth token in requests.
