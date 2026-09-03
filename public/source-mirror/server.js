/**
 * Express + Socket.IO Server cho TAPHOA Workspace
 * Khởi chạy: npm init -y && npm i express socket.io
 * Chạy server: node server.js
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

app.use(express.static('.'));

// Quản lý kết nối Socket.io
io.on('connection', (socket) => {
    console.log(`[+] Người dùng kết nối: ${socket.id}`);

    // Tham gia phòng trò chuyện
    socket.on('join_room', (roomId) => {
        socket.join(roomId);
        console.log(`User ${socket.id} đã vào phòng: ${roomId}`);
    });

    // Lắng nghe & chuyển tiếp tin nhắn Chat
    socket.on('send_message', (data) => {
        io.to(data.roomId).emit('receive_message', data);
    });

    // WebRTC Signaling: Gửi yêu cầu cuộc gọi
    socket.on('call_user', (data) => {
        io.to(data.userToCall).emit('incoming_call', {
            signal: data.signalData,
            from: data.from,
            name: data.name,
            callType: data.callType
        });
    });

    // WebRTC Signaling: Chấp nhận cuộc gọi
    socket.on('answer_call', (data) => {
        io.to(data.to).emit('call_accepted', data.signal);
    });

    // WebRTC Signaling: Kết thúc cuộc gọi
    socket.on('end_call', (data) => {
        io.to(data.to).emit('call_ended');
    });

    socket.on('disconnect', () => {
        console.log(`[-] Người dùng ngắt kết nối: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`================================================`);
    console.log(`Server CRM OmniChannel đang chạy tại: http://localhost:${PORT}`);
    console.log(`================================================`);
});