const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// SQLite Database Setup
const db = new Database(path.join(dataDir, 'lists.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS lists (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    list_id TEXT NOT NULL,
    text TEXT NOT NULL,
    completed INTEGER DEFAULT 0,
    created_at INTEGER,
    FOREIGN KEY(list_id) REFERENCES lists(id) ON DELETE CASCADE
  );
`);

app.use(express.static(path.join(__dirname, 'public')));

// Broadcast helpers
function broadcastLists() {
  const lists = db.prepare(`
    SELECT l.*, 
      (SELECT COUNT(*) FROM items WHERE list_id = l.id AND completed = 0) as active_count
    FROM lists l 
    ORDER BY created_at DESC
  `).all();
  io.emit('lists_updated', lists);
}

function broadcastItems(listId) {
  const items = db.prepare('SELECT * FROM items WHERE list_id = ? ORDER BY completed ASC, created_at DESC').all(listId);
  io.emit(`items_updated_${listId}`, items);
  broadcastLists(); // count updates
}

// WebSocket Event Handlers
io.on('connection', (socket) => {
  // Lists
  socket.on('get_lists', () => {
    const lists = db.prepare(`
      SELECT l.*, 
        (SELECT COUNT(*) FROM items WHERE list_id = l.id AND completed = 0) as active_count
      FROM lists l 
      ORDER BY created_at DESC
    `).all();
    socket.emit('lists_updated', lists);
  });

  socket.on('create_list', (name) => {
    if (!name || !name.trim()) return;
    const id = Date.now().toString();
    db.prepare('INSERT INTO lists (id, name, created_at) VALUES (?, ?, ?)').run(id, name.trim(), Date.now());
    broadcastLists();
  });

  socket.on('rename_list', ({ id, name }) => {
    if (!name || !name.trim()) return;
    db.prepare('UPDATE lists SET name = ? WHERE id = ?').run(name.trim(), id);
    broadcastLists();
  });

  socket.on('delete_list', (id) => {
    db.prepare('DELETE FROM items WHERE list_id = ?').run(id);
    db.prepare('DELETE FROM lists WHERE id = ?').run(id);
    broadcastLists();
  });

  // Items
  socket.on('get_items', (listId) => {
    const items = db.prepare('SELECT * FROM items WHERE list_id = ? ORDER BY completed ASC, created_at DESC').all(listId);
    socket.emit(`items_updated_${listId}`, items);
  });

  socket.on('add_item', ({ listId, text }) => {
    if (!text || !text.trim()) return;
    const id = Date.now().toString();
    db.prepare('INSERT INTO items (id, list_id, text, completed, created_at) VALUES (?, ?, ?, 0, ?)').run(id, listId, text.trim(), Date.now());
    broadcastItems(listId);
  });

  socket.on('toggle_item', ({ id, listId }) => {
    db.prepare('UPDATE items SET completed = 1 - completed WHERE id = ?').run(id);
    broadcastItems(listId);
  });

  socket.on('delete_item', ({ id, listId }) => {
    db.prepare('DELETE FROM items WHERE id = ?').run(id);
    broadcastItems(listId);
  });

  socket.on('clear_completed', (listId) => {
    db.prepare('DELETE FROM items WHERE list_id = ? AND completed = 1').run(listId);
    broadcastItems(listId);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Ross Family Lists running on port ${PORT}`);
});