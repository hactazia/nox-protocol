const express = require('express');
const socketIO = require('socket.io');
const http = require('http');
const path = require('path');
const Client = require('./client.js');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    socket.data = { client: new Client() };
    socket.on('disconnect', () => {
        socket.data.client.sendClose();
    });

    socket.on('start', async (data) => {
        var c = await socket.data.client.connect(data.host, data.port);
        socket.emit('start', c);

        setInterval(async () => {
            var p = await socket.data.client.sendPing();
        }, 1000);
    });

    socket.on('handshake', async () => {
        var h = await socket.data.client.sendHandshake();
        socket.emit('handshake', h);
    });

    socket.on('login', async (data) => {
        var l = await socket.data.client.sendLogin(data);
        socket.emit('login', l);
    });

    socket.on('status', async () => {
        var s = await socket.data.client.sendStatus();
        socket.emit('status', s);
    });

    socket.on('instance/enter', async (data) => {
        var i = await socket.data.client.sendInstanceEnter(data);
        socket.emit('instance/enter', i);
    });

    socket.on('instance/quit', async () => {
        var i = await socket.data.client.sendInstanceQuit();
        socket.emit('instance/quit', i);
    });

    socket.on('instance/transform', async (data) => {
        var t = await socket.data.client.sendInstanceTransform(data.internal_instance_id, {
            ...data.type,
            ...data.id,
            ...data.internal_instance_id
        }, data);
    });

    socket.data.client.on('instance/transform', (data) => {
        socket.emit('instance/transform', data);
    });
});

server.listen(3000, () => {
    console.log('listening on *:3000');
});
