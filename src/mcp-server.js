#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ChromaClient } from 'chromadb';
import OpenAI from 'openai';

const chroma = new ChromaClient();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
let collection;

const server = new Server({ name: 'rag-clip', version: '1.0.0' }, { capabilities: { tools: {} } });

server.setRequestHandler('tools/list', async () => ({
  tools: [{
    name: 'search_saved_content',
    description: 'Search through saved articles and content',
    inputSchema: {
      type: 'object',
      properties: { 
        query: { type: 'string' },
        userId: { type: 'number', description: 'User ID for scoped search' }
      },
      required: ['query', 'userId']
    }
  }]
}));

server.setRequestHandler('tools/call', async (request) => {
  if (request.params.name === 'search_saved_content') {
    const { query, userId } = request.params.arguments;
    
    const embedding = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query
    });

    const results = await collection.query({
      queryEmbeddings: [embedding.data[0].embedding],
      nResults: 5,
      where: { userId: userId.toString() }
    });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(results, null, 2)
      }]
    };
  }
});

async function main() {
  collection = await chroma.getOrCreateCollection({ name: "saved_content" });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main();
