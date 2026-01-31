import express from 'express';
import multer from 'multer';
import bcrypt from 'bcrypt';
import { ChromaClient } from 'chromadb';
import OpenAI from 'openai';
import { sign, authMiddleware } from './auth.js';
import db from './db.js';
import { parsePDF, parseDOCX, parseExcel, parseImage } from './parsers.js';

const app = express();
app.use(express.json());
app.use(express.static('public'));

const upload = multer({ dest: 'uploads/' });
const chroma = new ChromaClient();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

let collection;

async function init() {
  collection = await chroma.getOrCreateCollection({ name: "saved_content" });
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

async function saveToRAG(userId, type, title, content, url = null, filePath = null) {
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

  db.prepare('INSERT INTO items (user_id, type, title, url, file_path, content, chroma_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(userId, type, title, url, filePath, content.slice(0, 1000), chromaId);
}

app.post('/save', authMiddleware, async (req, res) => {
  const { url, title, content } = req.body;
  await saveToRAG(req.userId, 'webpage', title, content, url);
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

  await saveToRAG(req.userId, type, file.originalname, content, null, file.path);
  res.json({ success: true });
});

init().then(() => app.listen(3000, () => console.log('Server on :3000')));
