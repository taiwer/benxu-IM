import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Database Setup ---
const db = new Database('chat.db');
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT UNIQUE,
    visitor_id TEXT,
    status TEXT DEFAULT 'open',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    sender_type TEXT, -- 'visitor' or 'agent'
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// --- Enterprise WeChat Notifier ---
class WeChatNotifier {
  private corpId = process.env.WECHAT_CORP_ID || '';
  private secret = process.env.WECHAT_CORP_SECRET || '';
  private agentId = process.env.WECHAT_AGENT_ID || '';
  private accessToken = '';
  private expiresAt = 0;

  private async getAccessToken() {
    if (Date.now() < this.expiresAt) return this.accessToken;
    if (!this.corpId || !this.secret) return null;

    try {
      const resp = await axios.get<{ access_token?: string }>(`https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${this.corpId}&corpsecret=${this.secret}`);
      if (resp.data.access_token) {
        this.accessToken = resp.data.access_token;
        this.expiresAt = Date.now() + 7000 * 1000;
        return this.accessToken;
      }
    } catch (err) {
      console.error('Failed to get WeChat token:', err);
    }
    return null;
  }

  async send(sessionId: string, content: string) {
    const token = await this.getAccessToken();
    if (!token) {
      console.warn('WeChat config missing or token fetch failed. Skipping notification.');
      return;
    }

    const jwtSecret = process.env.JWT_SECRET || 'default-secret';
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const replyToken = jwt.sign({ sid: sessionId }, jwtSecret, { expiresIn: '24h' });
    const replyUrl = `${appUrl}/reply?sid=${sessionId}&token=${replyToken}`;

    const data = {
      touser: '@all',
      msgtype: 'news',
      agentid: this.agentId,
      news: {
        articles: [{
          title: '新访客咨询',
          description: content.substring(0, 50),
          url: replyUrl
        }]
      }
    };

    try {
      await axios.post(`https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${token}`, data);
    } catch (err) {
      console.error('Failed to send WeChat notification:', err);
    }
  }
}

const notifier = new WeChatNotifier();

// --- WebSocket Management ---
const visitorConns = new Map<string, WebSocket>(); // visitor_id -> websocket

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // --- API Routes ---

  // Get message history
  app.get('/api/history', (req, res) => {
    const { visitor_id, sid, token } = req.query;
    let sessionId: string | null = null;

    if (token && sid) {
      try {
        const decoded = jwt.verify(token as string, process.env.JWT_SECRET || 'default-secret') as any;
        if (decoded.sid === sid) sessionId = sid as string;
      } catch (err) {
        return res.status(403).json({ error: 'Invalid token' });
      }
    } else if (visitor_id) {
      const sess = db.prepare('SELECT session_id FROM sessions WHERE visitor_id = ? ORDER BY id DESC LIMIT 1').get(visitor_id) as any;
      if (sess) sessionId = sess.session_id;
    }

    if (!sessionId) return res.json([]);
    const msgs = db.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC').all(sessionId);
    res.json(msgs);
  });

  // Agent Reply
  app.post('/api/agent/reply', async (req, res) => {
    const { sid, token, content } = req.body;
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret') as any;
      if (decoded.sid !== sid) throw new Error('SID mismatch');
    } catch (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }

    // Save message
    db.prepare('INSERT INTO messages (session_id, sender_type, content) VALUES (?, ?, ?)').run(sid, 'agent', content);

    // Push via WebSocket
    const sess = db.prepare('SELECT visitor_id FROM sessions WHERE session_id = ?').get(sid) as any;
    if (sess && visitorConns.has(sess.visitor_id)) {
      visitorConns.get(sess.visitor_id)?.send(JSON.stringify({
        sender_type: 'agent',
        content,
        created_at: new Date().toISOString()
      }));
    }

    res.json({ status: 'ok' });
  });

  // Health check
  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

  // --- Vite Middleware ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });

  // --- WebSocket Server ---
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws, req) => {
    const visitor_id = new URL(req.url!, 'http://localhost').searchParams.get('visitor_id');
    if (!visitor_id) {
      ws.close();
      return;
    }

    visitorConns.set(visitor_id, ws);

    ws.on('message', async (data) => {
      const content = data.toString();
      
      // Get or create session
      let sess = db.prepare("SELECT session_id FROM sessions WHERE visitor_id = ? AND status = 'open'").get(visitor_id) as any;
      if (!sess) {
        const sessionId = uuidv4().substring(0, 8);
        db.prepare('INSERT INTO sessions (session_id, visitor_id) VALUES (?, ?)').run(sessionId, visitor_id);
        sess = { session_id: sessionId };
      }

      // Save message
      db.prepare('INSERT INTO messages (session_id, sender_type, content) VALUES (?, ?, ?)').run(sess.session_id, 'visitor', content);
      db.prepare('UPDATE sessions SET updated_at = CURRENT_TIMESTAMP WHERE session_id = ?').run(sess.session_id);

      // Notify WeChat
      notifier.send(sess.session_id, content);
    });

    ws.on('close', () => {
      visitorConns.delete(visitor_id);
    });
  });
}

startServer();
