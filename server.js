const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.static('public'));
app.use(express.json());

// Stockage en mémoire
const rooms = {
  'general': { name: 'Général', users: [], messages: [] },
  'musique': { name: 'Musique', users: [], messages: [] },
  'jeux': { name: 'Jeux Vidéo', users: [], messages: [] },
  'cinema': { name: 'Cinéma & Séries', users: [], messages: [] },
  'tech': { name: 'Technologie', users: [], messages: [] },
  'detente': { name: 'Détente', users: [], messages: [] }
};

const connectedUsers = new Map();

// Mots interdits pour la modération
const bannedWords = ['spam', 'hack', 'admin'];

function filterMessage(message) {
  let filtered = message;
  bannedWords.forEach(word => {
    const regex = new RegExp(word, 'gi');
    filtered = filtered.replace(regex, '*'.repeat(word.length));
  });
  return filtered;
}

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/rooms', (req, res) => {
  const roomsData = Object.keys(rooms).map(key => ({
    id: key,
    name: rooms[key].name,
    userCount: rooms[key].users.length
  }));
  res.json(roomsData);
});

// Socket.IO
io.on('connection', (socket) => {
  console.log('Nouvel utilisateur connecté:', socket.id);

  socket.on('join-room', (data) => {
    const { username, room } = data;
    
    if (!rooms[room]) return;

    // Quitter l'ancien salon si nécessaire
    if (connectedUsers.has(socket.id)) {
      const oldRoom = connectedUsers.get(socket.id).room;
      socket.leave(oldRoom);
      rooms[oldRoom].users = rooms[oldRoom].users.filter(u => u.id !== socket.id);
      io.to(oldRoom).emit('user-left', {
        username: connectedUsers.get(socket.id).username,
        userCount: rooms[oldRoom].users.length
      });
    }

    // Rejoindre le nouveau salon
    socket.join(room);
    const user = { id: socket.id, username, joinedAt: new Date() };
    rooms[room].users.push(user);
    connectedUsers.set(socket.id, { username, room });

    // Envoyer les messages récents
    socket.emit('room-messages', rooms[room].messages.slice(-50));
    
    // Notifier les autres utilisateurs
    socket.to(room).emit('user-joined', {
      username,
      userCount: rooms[room].users.length
    });

    // Envoyer la liste des utilisateurs
    io.to(room).emit('users-list', rooms[room].users.map(u => u.username));
  });

  socket.on('send-message', (data) => {
    if (!connectedUsers.has(socket.id)) return;

    const user = connectedUsers.get(socket.id);
    const room = user.room;
    
    const message = {
      id: Date.now(),
      username: user.username,
      content: filterMessage(data.message),
      timestamp: new Date(),
      room: room
    };

    rooms[room].messages.push(message);
    
    // Garder seulement les 100 derniers messages
    if (rooms[room].messages.length > 100) {
      rooms[room].messages = rooms[room].messages.slice(-100);
    }

    io.to(room).emit('new-message', message);
  });

  socket.on('disconnect', () => {
    if (connectedUsers.has(socket.id)) {
      const user = connectedUsers.get(socket.id);
      const room = user.room;
      
      rooms[room].users = rooms[room].users.filter(u => u.id !== socket.id);
      
      socket.to(room).emit('user-left', {
        username: user.username,
        userCount: rooms[room].users.length
      });

      io.to(room).emit('users-list', rooms[room].users.map(u => u.username));
      
      connectedUsers.delete(socket.id);
    }
    console.log('Utilisateur déconnecté:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 DialNet server running on port ${PORT}`);
  console.log(`📱 Access: http://localhost:${PORT}`);
});
