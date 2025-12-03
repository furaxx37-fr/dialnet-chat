class DialNetChat {
    constructor() {
        this.socket = null;
        this.currentUser = null;
        this.currentRoom = null;
        this.isConnected = false;
        
        this.initializeElements();
        this.attachEventListeners();
        this.loadRooms();
    }

    initializeElements() {
        // Screens
        this.loginScreen = document.getElementById('login-screen');
        this.chatScreen = document.getElementById('chat-screen');
        
        // Login elements
        this.loginForm = document.getElementById('login-form');
        this.usernameInput = document.getElementById('username');
        this.roomSelect = document.getElementById('room-select');
        
        // Chat elements
        this.messagesContainer = document.getElementById('messages-container');
        this.messageForm = document.getElementById('message-form');
        this.messageInput = document.getElementById('message-input');
        this.usersList = document.getElementById('users-list');
        this.currentRoomElement = document.getElementById('current-room');
        this.userCountElement = document.getElementById('user-count');
        this.currentUsernameElement = document.getElementById('current-username');
        this.userInfoElement = document.getElementById('user-info');
        this.disconnectBtn = document.getElementById('disconnect-btn');
        this.changeRoomBtn = document.getElementById('change-room-btn');
        this.notificationsContainer = document.getElementById('notifications');
    }

    attachEventListeners() {
        this.loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        this.messageForm.addEventListener('submit', (e) => this.handleSendMessage(e));
        this.disconnectBtn.addEventListener('click', () => this.handleDisconnect());
        this.changeRoomBtn.addEventListener('click', () => this.handleChangeRoom());
        
        // Auto-scroll to bottom when typing
        this.messageInput.addEventListener('input', () => this.scrollToBottom());
        
        // Enter key handling
        this.usernameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.loginForm.dispatchEvent(new Event('submit'));
        });
    }

    async loadRooms() {
        try {
            const response = await fetch('/api/rooms');
            const rooms = await response.json();
            
            this.roomSelect.innerHTML = '';
            rooms.forEach(room => {
                const option = document.createElement('option');
                option.value = room.id;
                option.textContent = `${this.getRoomIcon(room.id)} ${room.name} (${room.userCount})`;
                this.roomSelect.appendChild(option);
            });
        } catch (error) {
            console.error('Erreur lors du chargement des salons:', error);
        }
    }

    getRoomIcon(roomId) {
        const icons = {
            'general': '🌟',
            'musique': '🎵',
            'jeux': '🎮',
            'cinema': '🎬',
            'tech': '💻',
            'detente': '😌'
        };
        return icons[roomId] || '💬';
    }

    getRoomName(roomId) {
        const names = {
            'general': 'Général',
            'musique': 'Musique',
            'jeux': 'Jeux Vidéo',
            'cinema': 'Cinéma & Séries',
            'tech': 'Technologie',
            'detente': 'Détente'
        };
        return names[roomId] || roomId;
    }

    handleLogin(e) {
        e.preventDefault();
        
        const username = this.usernameInput.value.trim();
        const room = this.roomSelect.value;
        
        if (!username || username.length < 2) {
            this.showNotification('Le pseudonyme doit contenir au moins 2 caractères', 'error');
            return;
        }
        
        if (username.length > 20) {
            this.showNotification('Le pseudonyme ne peut pas dépasser 20 caractères', 'error');
            return;
        }
        
        this.currentUser = username;
        this.currentRoom = room;
        
        this.connectToServer();
    }

    connectToServer() {
        this.socket = io();
        
        this.socket.on('connect', () => {
            console.log('Connecté au serveur');
            this.isConnected = true;
            this.joinRoom();
        });
        
        this.socket.on('disconnect', () => {
            console.log('Déconnecté du serveur');
            this.isConnected = false;
            this.showNotification('Connexion perdue. Tentative de reconnexion...', 'error');
        });
        
        this.socket.on('room-messages', (messages) => {
            this.displayMessages(messages);
        });
        
        this.socket.on('new-message', (message) => {
            this.displayMessage(message);
            this.scrollToBottom();
        });
        
        this.socket.on('user-joined', (data) => {
            this.showNotification(`${data.username} a rejoint le salon`, 'info');
            this.updateUserCount(data.userCount);
        });
        
        this.socket.on('user-left', (data) => {
            this.showNotification(`${data.username} a quitté le salon`, 'info');
            this.updateUserCount(data.userCount);
        });
        
        this.socket.on('users-list', (users) => {
            this.updateUsersList(users);
        });
        
        this.socket.on('connect_error', (error) => {
            console.error('Erreur de connexion:', error);
            this.showNotification('Erreur de connexion au serveur', 'error');
        });
    }

    joinRoom() {
        this.socket.emit('join-room', {
            username: this.currentUser,
            room: this.currentRoom
        });
        
        this.showChatScreen();
    }

    showChatScreen() {
        this.loginScreen.classList.add('hidden');
        this.chatScreen.classList.remove('hidden');
        this.userInfoElement.classList.remove('hidden');
        this.disconnectBtn.classList.remove('hidden');
        
        this.currentUsernameElement.textContent = this.currentUser;
        this.currentRoomElement.textContent = `${this.getRoomIcon(this.currentRoom)} ${this.getRoomName(this.currentRoom)}`;
        
        this.messageInput.focus();
        this.showNotification(`Bienvenue dans ${this.getRoomName(this.currentRoom)} !`, 'success');
    }

    handleSendMessage(e) {
        e.preventDefault();
        
        const message = this.messageInput.value.trim();
        if (!message || !this.isConnected) return;
        
        this.socket.emit('send-message', { message });
        this.messageInput.value = '';
    }

    displayMessages(messages) {
        this.messagesContainer.innerHTML = '';
        messages.forEach(message => this.displayMessage(message, false));
        this.scrollToBottom();
    }

    displayMessage(message, animate = true) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${animate ? 'message' : ''} ${message.username === this.currentUser ? 'message-own' : ''}`;
        
        const isOwn = message.username === this.currentUser;
        const bubbleClass = isOwn ? 'message-bubble own' : 'message-bubble other';
        
        const time = new Date(message.timestamp).toLocaleTimeString('fr-FR', {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        messageDiv.innerHTML = `
            <div class="flex ${isOwn ? 'justify-end' : 'justify-start'} mb-2">
                <div class="${bubbleClass} px-4 py-2 rounded-2xl shadow-lg">
                    ${!isOwn ? `<div class="text-xs text-gray-300 mb-1 font-medium">${message.username}</div>` : ''}
                    <div class="text-white">${this.escapeHtml(message.content)}</div>
                    <div class="text-xs ${isOwn ? 'text-red-200' : 'text-gray-400'} mt-1 text-right">${time}</div>
                </div>
            </div>
        `;
        
        this.messagesContainer.appendChild(messageDiv);
    }

    updateUsersList(users) {
        this.usersList.innerHTML = '';
        users.forEach(username => {
            const userDiv = document.createElement('div');
            userDiv.className = 'user-item flex items-center p-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors';
            userDiv.innerHTML = `
                <div class="status-online"></div>
                <span class="text-white ${username === this.currentUser ? 'font-semibold text-red-400' : ''}">${username}</span>
                ${username === this.currentUser ? '<span class="ml-2 text-xs text-red-300">(vous)</span>' : ''}
            `;
            this.usersList.appendChild(userDiv);
        });
    }

    updateUserCount(count) {
        this.userCountElement.textContent = `${count} utilisateur${count > 1 ? 's' : ''} connecté${count > 1 ? 's' : ''}`;
    }

    handleDisconnect() {
        if (this.socket) {
            this.socket.disconnect();
        }
        this.showLoginScreen();
    }

    handleChangeRoom() {
        this.showLoginScreen();
    }

    showLoginScreen() {
        this.chatScreen.classList.add('hidden');
        this.loginScreen.classList.remove('hidden');
        this.userInfoElement.classList.add('hidden');
        this.disconnectBtn.classList.add('hidden');
        
        this.currentUser = null;
        this.currentRoom = null;
        this.isConnected = false;
        
        this.usernameInput.value = '';
        this.messageInput.value = '';
        this.messagesContainer.innerHTML = '';
        this.usersList.innerHTML = '';
        
        this.loadRooms();
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification px-6 py-3 rounded-lg shadow-lg text-white font-medium ${this.getNotificationClass(type)}`;
        notification.textContent = message;
        
        this.notificationsContainer.appendChild(notification);
        
        setTimeout(() => {
            notification.classList.add('removing');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }

    getNotificationClass(type) {
        const classes = {
            'success': 'bg-green-600',
            'error': 'bg-red-600',
            'info': 'bg-blue-600',
            'warning': 'bg-yellow-600'
        };
        return classes[type] || classes.info;
    }

    scrollToBottom() {
        setTimeout(() => {
            this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        }, 100);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize the chat application
document.addEventListener('DOMContentLoaded', () => {
    new DialNetChat();
});

// Handle page visibility for better UX
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        document.title = 'DialNet - Chat en ligne (inactif)';
    } else {
        document.title = 'DialNet - Chat en ligne';
    }
});
