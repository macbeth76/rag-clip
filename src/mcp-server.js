#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ChromaClient } from 'chromadb';
import OpenAI from 'openai';
import db from './db.js';
import BM25 from './bm25.js';

const chroma = new ChromaClient();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
let collection;
const bm25Index = new Map();

const server = new Server({ name: 'rag-clip', version: '1.0.0' }, { capabilities: { tools: {} } });

server.setRequestHandler('tools/list', async () => ({
  tools: [{
    name: 'search_saved_content',
    description: 'Search through saved articles and content with hybrid search and filters',
    inputSchema: {
      type: 'object',
      properties: { 
        query: { type: 'string' },
        userId: { type: 'number', description: 'User ID for scoped search' },
        mode: { type: 'string', enum: ['semantic', 'keyword', 'hybrid'], default: 'hybrid' },
        type: { type: 'string', description: 'Filter by content type (webpage, pdf, docx, excel, image)' },
        startDate: { type: 'string', description: 'Filter by start date (ISO format)' },
        endDate: { type: 'string', description: 'Filter by end date (ISO format)' }
      },
      required: ['query', 'userId']
    }
  }]
}));

server.setRequestHandler('tools/call', async (request) => {
  if (request.params.name === 'search_saved_content') {
    const { query, userId, mode = 'hybrid', type, startDate, endDate } = request.params.arguments;
    
    let results = [];
    
    // Semantic search
    if (mode === 'semantic' || mode === 'hybrid') {
      const embedding = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: query
      });

      const semanticResults = await collection.query({
        queryEmbeddings: [embedding.data[0].embedding],
        nResults: 10,
        where: { userId: userId.toString() }
      });

      results = semanticResults.ids[0].map((id, i) => ({
        id,
        score: 1 - semanticResults.distances[0][i],
        type: 'semantic',
        metadata: semanticResults.metadatas[0][i],
        content: semanticResults.documents[0][i]
      }));
    }
    
    // Keyword search
    if (mode === 'keyword' || mode === 'hybrid') {
      const userBM25 = bm25Index.get(userId);
      if (userBM25) {
        const keywordResults = userBM25.search(query, 10);
        
        keywordResults.forEach(kr => {
          const item = db.prepare('SELECT * FROM items WHERE id = ?').get(kr.id);
          if (item) {
            results.push({
              id: item.chroma_id,
              score: kr.score,
              type: 'keyword',
              metadata: { title: item.title, url: item.url, type: item.type },
              content: item.content
            });
          }
        });
      }
    }
    
    // Apply filters
    if (type || startDate || endDate) {
      let sql = 'SELECT chroma_id FROM items WHERE user_id = ?';
      const params = [userId];
      
      if (type) {
        sql += ' AND type = ?';
        params.push(type);
      }
      if (startDate) {
        sql += ' AND created_at >= ?';
        params.push(startDate);
      }
      if (endDate) {
        sql += ' AND created_at <= ?';
        params.push(endDate);
      }
      
      const filteredIds = new Set(db.prepare(sql).all(...params).map(r => r.chroma_id));
      results = results.filter(r => filteredIds.has(r.id));
    }
    
    // Merge for hybrid
    if (mode === 'hybrid') {
      const merged = new Map();
      results.forEach(r => {
        if (merged.has(r.id)) {
          merged.get(r.id).score += r.score;
        } else {
          merged.set(r.id, r);
        }
      });
      results = Array.from(merged.values()).sort((a, b) => b.score - a.score);
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(results.slice(0, 10), null, 2)
      }]
    };
  }
});

async function main() {
  collection = await chroma.getOrCreateCollection({ name: "saved_content" });
  
  // Build BM25 index
  const items = db.prepare('SELECT id, user_id, content FROM items').all();
  items.forEach(item => {
    if (!bm25Index.has(item.user_id)) {
      bm25Index.set(item.user_id, new BM25());
    }
    bm25Index.get(item.user_id).addDocument(item.content, item.id);
  });
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main();
