import express from 'express';
import multer from 'multer';
import bcrypt from 'bcrypt';
import { ChromaClient } from 'chromadb';
import OpenAI from 'openai';
import { sign, authMiddleware } from './auth.js';
import db from './db.js';
import { parsePDF, parseDOCX, parseExcel, parseImage } from './parsers.js';
import { extractArticle } from './readability.js';
import BM25 from './bm25.js';

const app = express();
app.use(express.json());
app.use(express.static('public'));

const upload = multer({ dest: 'uploads/' });
const chroma = new ChromaClient();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

let collection;
const bm25Index = new Map(); // userId -> BM25 instance

async function init() {
  collection = await chroma.getOrCreateCollection({ name: "saved_content" });
  
  // Build BM25 index from existing items
  const items = db.prepare('SELECT id, user_id, content FROM items').all();
  items.forEach(item => {
    if (!bm25Index.has(item.user_id)) {
      bm25Index.set(item.user_id, new BM25());
    }
    bm25Index.get(item.user_id).addDocument(item.content, item.id);
  });
}

app.post('/signup', async (req, res) => {
  const { email, password } = req.body;
  const hash = await bcrypt.hash(password, 10);
  try {
    const result = db.prepare('INSERT INTO users (email, password) VALUES (?, ?)').run(email, hash);
    res.json({ token: sign({ userId: result.lastInsertRowid }) });
  } catch {
    res.status(400).json({ error: 'Email exists' });
  }
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !await bcrypt.compare(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  res.json({ token: sign({ userId: user.id }) });
});

async function saveToRAG(userId, type, title, content, excerpt = null, url = null, filePath = null) {
  const chromaId = `${userId}_${Date.now()}`;
  
  const embedding = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: content.slice(0, 8000)
  });

  await collection.add({
    ids: [chromaId],
    embeddings: [embedding.data[0].embedding],
    metadatas: [{ userId: userId.toString(), type, title, url: url || '' }],
    documents: [content]
  });

  const result = db.prepare('INSERT INTO items (user_id, type, title, url, file_path, content, excerpt, chroma_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(userId, type, title, url, filePath, content.slice(0, 1000), excerpt, chromaId);

  // Add to BM25 index
  if (!bm25Index.has(userId)) {
    bm25Index.set(userId, new BM25());
  }
  bm25Index.get(userId).addDocument(content, result.lastInsertRowid);
}

app.post('/save', authMiddleware, async (req, res) => {
  const { url, title, content, html } = req.body;
  
  let finalTitle = title;
  let finalContent = content;
  let excerpt = null;
  
  // Try Readability extraction if HTML provided
  if (html) {
    const article = await extractArticle(html, url);
    if (article) {
      finalTitle = article.title || title;
      finalContent = article.content;
      excerpt = article.excerpt;
    }
  }
  
  await saveToRAG(req.userId, 'webpage', finalTitle, finalContent, excerpt, url);
  res.json({ success: true });
});

app.post('/upload', authMiddleware, upload.single('file'), async (req, res) => {
  const { file } = req;
  let content, type;

  if (file.mimetype === 'application/pdf') {
    content = await parsePDF(file.path);
    type = 'pdf';
  } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    content = await parseDOCX(file.path);
    type = 'docx';
  } else if (file.mimetype.includes('spreadsheet') || file.originalname.endsWith('.xlsx')) {
    content = await parseExcel(file.path);
    type = 'excel';
  } else if (file.mimetype.startsWith('image/')) {
    content = await parseImage(file.path);
    type = 'image';
  } else {
    return res.status(400).json({ error: 'Unsupported file type' });
  }

  await saveToRAG(req.userId, type, file.originalname, content, null, null, file.path);
  res.json({ success: true });
});

app.post('/search', authMiddleware, async (req, res) => {
  const { query, type, startDate, endDate, mode = 'hybrid' } = req.body;
  
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
      where: { userId: req.userId.toString() }
    });

    results = semanticResults.ids[0].map((id, i) => ({
      id,
      score: semanticResults.distances[0][i],
      type: 'semantic',
      metadata: semanticResults.metadatas[0][i],
      content: semanticResults.documents[0][i]
    }));
  }
  
  // Keyword search (BM25)
  if (mode === 'keyword' || mode === 'hybrid') {
    const userBM25 = bm25Index.get(req.userId);
    if (userBM25) {
      const keywordResults = userBM25.search(query, 10);
      
      keywordResults.forEach(kr => {
        const item = db.prepare('SELECT * FROM items WHERE id = ?').get(kr.id);
        results.push({
          id: item.chroma_id,
          score: kr.score,
          type: 'keyword',
          metadata: { title: item.title, url: item.url, type: item.type },
          content: item.content
        });
      });
    }
  }
  
  // Apply filters
  let filteredIds = null;
  if (type || startDate || endDate) {
    let sql = 'SELECT chroma_id FROM items WHERE user_id = ?';
    const params = [req.userId];
    
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
    
    filteredIds = new Set(db.prepare(sql).all(...params).map(r => r.chroma_id));
    results = results.filter(r => filteredIds.has(r.id));
  }
  
  // Merge and deduplicate for hybrid
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
  
  res.json({ results: results.slice(0, 10) });
});

init().then(() => app.listen(3000, () => console.log('Server on :3000')));
