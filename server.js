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
  'general': { name: 'Général', users: [], messages: [], type: 'public', password: null },
  'musique': { name: 'Musique', users: [], messages: [], type: 'public', password: null },
  'jeux': { name: 'Jeux Vidéo', users: [], messages: [], type: 'public', password: null },
  'cinema': { name: 'Cinéma & Séries', users: [], messages: [], type: 'public', password: null },
  'tech': { name: 'Technologie', users: [], messages: [], type: 'public', password: null },
  'detente': { name: 'Détente', users: [], messages: [], type: 'public', password: null }
};

// Stockage des salons privés
const privateRooms = new Map();

const connectedUsers = new Map();

const connectedIPs = new Map(); // Suivi des adresses IP pour éviter les connexions multiples

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
    userCount: rooms[key].users.length,
    type: rooms[key].type
  }));
  
  // Ajouter les salons privés
  const privateRoomsData = Array.from(privateRooms.entries()).map(([id, room]) => ({
    id: id,
    name: room.name,
    userCount: room.users.length,
    type: 'private'
  }));
  
  res.json([...roomsData, ...privateRoomsData]);
});

// Route pour la connexion utilisateur
app.post('/api/login', (req, res) => {
  const { username, department, gender } = req.body;
  
  if (!username || !department || !gender) {
    return res.status(400).json({ error: 'Nom d\'utilisateur, département et sexe requis' });
  }
  
  // Valider les données
  if (username.length < 2 || username.length > 20) {
    return res.status(400).json({ error: 'Le nom d\'utilisateur doit contenir entre 2 et 20 caractères' });
  }
  
  // Retourner succès
  res.json({ 
    success: true, 
    message: 'Connexion réussie',
    user: { username, department, gender }
  });
});

// Route pour créer un salon privé
app.post('/api/create-private-room', (req, res) => {
  const { roomName, password, creatorName } = req.body;
  
  if (!roomName || !password || !creatorName) {
    return res.status(400).json({ error: 'Nom du salon, mot de passe et nom du créateur requis' });
  }
  
  // Générer un ID unique pour le salon
  const roomId = 'private_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  
  // Créer le salon privé
  privateRooms.set(roomId, {
    name: roomName,
    password: password,
    creator: creatorName,
    users: [],
    messages: [],
    type: 'private',
    createdAt: new Date()
  });
  
  res.json({ 
    success: true, 
    roomId: roomId,
    message: 'Salon privé créé avec succès' 
  });
});

// Socket.IO
io.on('connection', (socket) => {
  console.log('Nouvel utilisateur connecté:', socket.id);

  socket.on('join-room', (data) => {
    const { username, room, department, gender, password } = data;
    
    // Vérifier si c'est un salon public ou privé
    let targetRoom = null;
    let isPrivateRoom = false;
    
    if (rooms[room]) {
      targetRoom = rooms[room];
    } else if (privateRooms.has(room)) {
      targetRoom = privateRooms.get(room);
      isPrivateRoom = true;
      
      // Vérifier le mot de passe pour les salons privés
      if (targetRoom.password !== password) {
        socket.emit('join-error', { message: 'Mot de passe incorrect' });
        return;
      }
    } else {
      socket.emit('join-error', { message: 'Salon introuvable' });
      return;
    }

    // Gérer les connexions multiples depuis la même IP
    const clientIP = socket.handshake.address;
    if (connectedIPs.has(clientIP)) {
      const oldSocketId = connectedIPs.get(clientIP);
      const oldSocket = io.sockets.sockets.get(oldSocketId);
      
      if (oldSocket && connectedUsers.has(oldSocketId)) {
        const oldUserData = connectedUsers.get(oldSocketId);
        const oldRoom = oldUserData.room;
        
        // Supprimer l'ancien utilisateur de la room
        if (rooms[oldRoom]) {
          rooms[oldRoom].users = rooms[oldRoom].users.filter(u => u.id !== oldSocketId);
          
          // Notifier les autres utilisateurs de la déconnexion
          oldSocket.to(oldRoom).emit('user-left', {
            username: oldUserData.username,
            userCount: rooms[oldRoom].users.length
          });
          
          // Mettre à jour la liste des utilisateurs
          io.to(oldRoom).emit('users-list', rooms[oldRoom].users.map(u => u.username));
        }
        
        // Supprimer l'ancien utilisateur des maps
        connectedUsers.delete(oldSocketId);
        oldSocket.disconnect(true);
      }
    }
    
    // Enregistrer la nouvelle connexion IP
    connectedIPs.set(clientIP, socket.id);


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
    const user = { id: socket.id, username, department, gender, joinedAt: new Date() };
    targetRoom.users.push(user);
    connectedUsers.set(socket.id, { username, room, department, gender, isPrivateRoom });

    // Envoyer les messages récents
    socket.emit('room-messages', targetRoom.messages.slice(-50));
    
    // Notifier les autres utilisateurs
    socket.to(room).emit('user-joined', {
      username,
      userCount: targetRoom.users.length
    });

    // Envoyer la liste des utilisateurs
    io.to(room).emit('users-list', targetRoom.users.map(u => u.username));
  });

  socket.on('send-message', (data) => {
    if (!connectedUsers.has(socket.id)) return;

    const user = connectedUsers.get(socket.id);
    const room = user.room;
    
    // Trouver le salon (public ou privé)
    let targetRoom = null;
    if (rooms[room]) {
      targetRoom = rooms[room];
    } else if (privateRooms.has(room)) {
      targetRoom = privateRooms.get(room);
    }
    
    if (!targetRoom) return;
    
    const message = {
      id: Date.now(),
      username: user.username,
      content: filterMessage(data.message),
      timestamp: new Date(),
      room: room
    };

    targetRoom.messages.push(message);
    
    // Garder seulement les 100 derniers messages
    if (targetRoom.messages.length > 100) {
      targetRoom.messages = targetRoom.messages.slice(-100);
    }

    io.to(room).emit('new-message', message);
  });

  socket.on('disconnect', () => {
    if (connectedUsers.has(socket.id)) {
      const user = connectedUsers.get(socket.id);
      const room = user.room;
      
      // Vérifier si le salon existe encore
      if (rooms[room]) {
        rooms[room].users = rooms[room].users.filter(u => u.id !== socket.id);
        
        socket.to(room).emit('user-left', {
          username: user.username,
          userCount: rooms[room].users.length
        });

        io.to(room).emit('users-list', rooms[room].users.map(u => u.username));
        
        // Supprimer les salons privés vides
        if (rooms[room].type === 'private' && rooms[room].users.length === 0) {
          delete rooms[room];
          console.log(`Salon privé ${room} supprimé car vide`);
        }
      }
      
      connectedUsers.delete(socket.id);
      
      // Nettoyer la Map des IP
      const clientIP = socket.handshake.address;
      if (connectedIPs.has(clientIP) && connectedIPs.get(clientIP) === socket.id) {
        connectedIPs.delete(clientIP);
      }
    }
    console.log('Utilisateur déconnecté:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 DialNet server running on port ${PORT}`);
  console.log(`📱 Access: http://localhost:${PORT}`);
  console.log(`🌐 Public Access: http://$(curl -s ifconfig.me):${PORT}`);
});
