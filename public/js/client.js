export default class Client {
    constructor(socket) {
        this.socket = socket;

        socket.on('instance/transform', (data) => this.transforms.set(data.path, data));

        socket.on('instance/join', (data) => {
            console.log('instance/join', data);
        });

        socket.on('instance/leave', (data) => {
            console.log('instance/leave', data);
        });
    }

    transforms = new Map();

    connect(host, port) {
        return new Promise((resolve, reject) => {
            this.socket.emit('start', { host, port });
            this.socket.once('start', (data) => {
                resolve(data);
            });
        });
    }

    sendPing() {
        return new Promise((resolve, reject) => {
            this.socket.emit('ping');
            this.socket.once('ping', (data) => {
                resolve(data);
            });
        });
    }

    sendHandshake() {
        return new Promise((resolve, reject) => {
            this.socket.emit('handshake');
            this.socket.once('handshake', (data) => {
                resolve(data);
            });
        });
    }

    sendLogin(data) {
        return new Promise((resolve, reject) => {
            this.socket.emit('login', data);
            this.socket.once('login', (data) => {
                resolve(data);
            });
        });
    }

    sendStatus() {
        return new Promise((resolve, reject) => {
            this.socket.emit('status');
            this.socket.once('status', (data) => {
                resolve(data);
            });
        });
    }

    sendInstanceEnter(data) {
        return new Promise((resolve, reject) => {
            this.socket.emit('instance/enter', data);
            this.socket.once('instance/enter', (data) => {
                resolve(data);
            });
        });
    }

    sendInstanceQuit() {
        return new Promise((resolve, reject) => {
            this.socket.emit('instance/quit');
            this.socket.once('instance/quit', (data) => {
                resolve(data);
            });
        });
    }




}