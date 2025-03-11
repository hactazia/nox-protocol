var dgram = require('dgram');
const EventEmitter = require('events');
const { Socket } = require('net');

class Client extends EventEmitter {

    mode = 'udp';

    constructor() {
        super();
        /**
         * @type {Socket}
         */
        this.address = null;
        this.port = null;
        this.socket = null;
    }

    async connect(address, port) {
        this.address = address;
        this.port = port;
        if (this.mode === 'udp') {
            this.socket = dgram.createSocket('udp4');
            this.socket.on('message', msg => this._splitMessage(msg).forEach(this.onMessage.bind(this)));
            this.socket.on('error', (err) => this.emit('error', err));
            return true;
        } else if (this.mode === 'tcp') {
            this.socket = require('net').createConnection(port, address);
            this.socket.on('data', msg => this._splitMessage(msg).forEach(this.onMessage.bind(this)));
            this.socket.on('connect', () => this.emit('connect'));
            this.socket.on('error', (err) => this.emit('error', err));
        }
        let self = this;
        return new Promise((resolve) => {
            var f = function (bool) {
                self.off('connect', f);
                resolve(bool);
            }
            self.on('connect', () => f(true));
            self.on('error', () => f(false));
        });
    }

    _splitMessage(msg) {
        var messages = [];
        var offset = 0;
        while (offset < msg.length) {
            var length = msg.readUInt16BE(offset);
            messages.push(msg.slice(offset, offset + length));
            offset += length;
        }
        return messages;
    }

    /**
     * @param {Buffer} msg
     */
    onMessage(msg) {
        this.emit('message', msg);
        if (msg[2] === 0 && msg[3] === 0) switch (msg[4]) {
            case 5:
                let dl = msg.readUInt16BE(9);
                let ul = msg.readUInt16BE(19 + dl);
                this.emit('instance/join', {
                    internal_instance_id: msg.readUInt16BE(5),
                    player_id: msg.readUInt16BE(7),
                    display: msg.slice(11, 11 + dl).toString(),
                    connected_at: new Date(parseInt(msg.readBigInt64BE(11 + dl))),
                    ids: msg.slice(21 + dl, 21 + dl + ul).toString(),
                });
                break;
            case 6:
                this.emit('instance/leave', {
                    internal_instance_id: msg.readUInt16BE(5),
                    player_id: msg.readUInt16BE(5 + 2),
                });
                break;
            case 7:
                console.log(msg);
                let l = 0;
                let path = "";
                if (msg.readUInt8(7) === 1) {
                    // is object
                    path = "o/" + msg.readUInt16BE(8);
                    l = 2;
                } else if (msg.readUInt8(7) === 2) {
                    // is player
                    path = "p/" + msg.readUInt16BE(8) + "/" + msg.readUInt16BE(10);
                    l = 4;
                } else {
                    // is path
                    l = msg.readUInt16BE(8);
                    path = msg.slice(10, 10 + l).toString();
                }
                this.emit('instance/transform', {
                    internal_instance_id: msg.readUInt16BE(5),
                    path: path,
                    position: {
                        x: msg.readFloatBE(9 + l),
                        y: msg.readFloatBE(13 + l),
                        z: msg.readFloatBE(17 + l),
                    },
                    rotation: {
                        x: msg.readFloatBE(21 + l),
                        y: msg.readFloatBE(25 + l),
                        z: msg.readFloatBE(29 + l),
                        w: msg.readFloatBE(33 + l),
                    },
                    scale: {
                        x: msg.readFloatBE(37 + l),
                        y: msg.readFloatBE(41 + l),
                        z: msg.readFloatBE(45 + l),
                    },
                    velocity: {
                        x: msg.readFloatBE(49 + l),
                        y: msg.readFloatBE(53 + l),
                        z: msg.readFloatBE(57 + l),
                    },
                    angular_velocity: {
                        x: msg.readFloatBE(61 + l),
                        y: msg.readFloatBE(65 + l),
                        z: msg.readFloatBE(69 + l),
                    }
                });
                break;
            default:
                this.emit('unknown', msg);
                break;
        }
    }

    _makeMessage(event, data = []) {
        data = Buffer.from(data);
        var message = Buffer.alloc(5 + data.length);
        message.writeInt16BE(data.length + 5, 0);
        message.writeUInt16BE(Math.floor(Math.random() * 0xffff), 2);
        message.writeInt8(event, 4);
        data.copy(message, 5);
        return message;
    }

    async _send(event, data, timeout = 1000) {
        var message = this._makeMessage(event, data);
        if (!this.socket) return new Error('not connected');
        if (this.mode === 'tcp')
            this.socket?.write(message, (err) => { if (err) reject(err); });
        else if (this.mode === 'udp')
            this.socket?.send(message, this.port, this.address, (err) => { if (err) reject(err); });
        return new Promise((resolve, reject) => {
            var o = false;
            function f(msg, rinfo) {
                if (msg[2] == message[2] && msg[3] == message[3] && msg[4] == message[4]) {
                    this.off('message', f);
                    resolve({ incomming: msg, outcomming: message });
                    o = true;
                }
            }
            this.on('message', f);
            setTimeout(() => {
                if (!o) {
                    this.off('message', f);
                    reject(new Error('timeout'));
                }
            }, timeout);
        });
    }

    async sendHandshake() {
        let res = null;
        try {
            res = await this._send(0, []);
        } catch { return new Error('timeout'); }
        var d = {
            event: 'handshake',
            state: res.incomming.readUInt16BE(2),
            raw: {
                incomming: res.incomming,
                outcomming: res.outcomming
            },
            serialized: {
                version: res.incomming.readUInt16BE(5), // 2 bytes
                client_id: res.incomming.readUInt16BE(7), // 2 bytes
                client_status: ['connected', 'handshaked', 'authenticating', 'authenticated', 'disconnected'][res.incomming.readUInt8(9)], // 1 byte
                ip: res.incomming.slice(10, 14).join('.'), // 4 bytes
                port: res.incomming.readUInt16BE(14), // 2 bytes
            }
        };
        this.data.set('client_id', d.serialized.client_id);
        this.data.set('client_status', d.serialized.client_status);
        this.data.set('client_ip', d.serialized.ip);
        this.data.set('client_port', d.serialized.port);
        this.data.set('server_protocol_version', d.serialized.version);
        this.emit('handshake', d.serialized);
        return d;
    }

    async sendPing() {
        var data = Buffer.alloc(8);
        data.writeBigInt64BE(BigInt(Date.now()), 0);
        let res = null;
        try {
            res = await this._send(1, data);
        } catch { return new Error('timeout'); }
        const out0 = res.incomming.readBigInt64BE(5);
        const out1 = res.incomming.readBigInt64BE(13);
        const diff = out1 - out0;
        var d = {
            event: 'ping',
            state: res.incomming.readUInt16BE(2),
            raw: {
                incomming: res.incomming,
                outcomming: res.outcomming
            },
            serialized: {
                inital: out0,
                final: out1,
                difference: diff
            }
        };
        this.emit('ping', d.serialized);
        return d;
    }

    async sendStatus() {
        let res = null;
        try {
            res = await this._send(2, []);
        } catch { return new Error('timeout'); }
        var datalength = res.incomming.readUInt16BE(5);
        var data = Buffer.from(res.incomming.slice(7, 7 + datalength)).toString();
        var d = {
            event: 'status',
            state: res.incomming.readUInt16BE(2),
            raw: {
                incomming: res.incomming,
                outcomming: res.outcomming
            },
            serialized: JSON.parse(data)
        };
        this.emit('status', d.serialized);
        return d;
    }

    async sendLogin(obj) {
        var data = Buffer.alloc(1024);
        data.writeInt32BE(obj.token ? 1 : 0, 0);
        var token = obj.token ? obj.token : obj.integrity;
        data.writeUInt16BE(token.length, 4);
        data.write(token, 6);
        let res = null;
        try {
            res = await this._send(3, data, 5000);
        } catch { return new Error('timeout'); }
        const result = res.incomming.readUInt8(5);
        var out = {
            name: null,
            complement: null,
        };
        switch (result) {
            case 0:
                out = { name: 'success' };
                break;
            case 1:
                out = { name: 'invalid input' };
                break;
            case 2:
                out = { name: 'invalid access token' };
                break;
            case 3:
                out = { name: 'cannot contact AVRIMS' };
                break;
            case 4:
                out = { name: 'blacklisted' };
                break;
            case 5:
                out = { name: 'already connected' };
                break;
            case 6:
                out = { name: 'server not ready' };
                break;
            case 7:
            default:
                out = { name: 'unknown' };
                break;
        }
        var d = {
            event: 'login',
            state: res.incomming.readUInt16BE(2),
            raw: {
                incomming: res.incomming,
                outcomming: res.outcomming
            },
            serialized: {
                result,
                ...out
            }
        };
        this.emit('login', d.serialized);
        return d;
    }

    async sendClose() {
        try {
            await this._send(4, [], 100);
        } catch { }
        this.socket?.close();
        return { event: 'close' };
    }

    async sendInstanceEnter(internal_instance_id) {
        var data = Buffer.alloc(2);
        data.writeInt16BE(internal_instance_id, 0);
        let res = null;
        try {
            res = await this._send(5, data);
        } catch { return new Error('timeout'); }
        var result = res.incomming.readUInt8(5);
        var out = { name: null };
        switch (result) {
            case 0:
                var player_id = res.incomming.readUInt16BE(8);
                var displaylength = res.incomming.readUInt16BE(10);
                var display = res.incomming.slice(12, 12 + displaylength).toString();
                var connected_at = new Date(parseInt(res.incomming.readBigInt64BE(12 + displaylength)));
                var idslength = res.incomming.readUInt16BE(20 + displaylength);
                var ids = res.incomming.slice(22 + displaylength, 22 + displaylength + idslength).toString();
                this.data.set('internal_instance_id', internal_instance_id);
                this.data.set('player_id', player_id);
                this.data.set('display', display);
                this.data.set('connected_at', connected_at);
                this.data.set('ids', ids);
                out = {
                    name: 'success',
                    player_id,
                    display,
                    connected_at,
                    ids
                };
                break;
            case 1:
                out = { name: 'invalid input' };
                break;
            case 2:
                out = { name: 'not ready' };
                break;
            case 3:
                out = { name: 'not found' };
                break;
            case 4:
                out = { name: 'full' };
                break;
            case 5:
                out = { name: 'blacklisted' };
                break;
            case 6:
                out = { name: 'already connected' };
                break;
            case 7:
                out = { name: 'not whitelisted' };
                break;
            case 8:
            default:
                out = { name: 'unknown' };
                break;
        }
        var d = {
            event: 'instance/enter',
            state: res.incomming.readUInt16BE(2),
            raw: {
                incomming: res.incomming,
                outcomming: res.outcomming
            },
            serialized: {
                result: result,
                internal_instance_id: res.incomming.readUInt16BE(6),
                ...out
            }
        };
        this.emit('instance/enter', d.serialized);
        return d;
    }

    async sendInstanceTransform(internal_instance_id, data, transform) {
        let bytes = [];
        if (data.type === 'path') {
            bytes = Buffer.alloc(2 + data.path.length);
            bytes.writeUInt16BE(data.path.length, 0);
            bytes.write(data.path, 2);
        } else if (data.type === 'object') {
            bytes = Buffer.alloc(2);
            bytes.writeUInt16BE(data.id, 0);
        } else if (data.type === 'player') {
            bytes = Buffer.alloc(4);
            bytes.writeUInt16BE(data.player_id, 0);
            bytes.writeUInt16BE(data.element, 2);
        }
        var offset = 0;
        var data = Buffer.alloc(1024);
        data.writeInt16BE(internal_instance_id, 0);
        for (var i = 0; i < bytes.length; i++) {
            data.writeUInt8(bytes[i], 2 + i);
        }
        offset += 2 + bytes.length;
        // add position(x,y,z) floats to the buffer
        data.writeFloatBE(transform.position.x, offset);
        data.writeFloatBE(transform.position.y, offset + 4);
        data.writeFloatBE(transform.position.z, offset + 8);
        // add rotation(x,y,z,w) floats to the buffer
        offset += 12;
        data.writeFloatBE(transform.rotation.x, offset);
        data.writeFloatBE(transform.rotation.y, offset + 4);
        data.writeFloatBE(transform.rotation.z, offset + 8);
        data.writeFloatBE(transform.rotation.w, offset + 12);
        // add scale(x,y,z) floats to the buffer
        offset += 16;
        data.writeFloatBE(transform.scale.x, offset);
        data.writeFloatBE(transform.scale.y, offset + 4);
        data.writeFloatBE(transform.scale.z, offset + 8);
        offset += 12;
        // if have (velocity, angular_velocity) add them
        if (transform.velocity && transform.angular_velocity) {
            data.writeFloatBE(transform.velocity.x, offset);
            data.writeFloatBE(transform.velocity.y, offset + 4);
            data.writeFloatBE(transform.velocity.z, offset + 8);
            offset += 12;
            data.writeFloatBE(transform.angular_velocity.x, offset);
            data.writeFloatBE(transform.angular_velocity.y, offset + 4);
            data.writeFloatBE(transform.angular_velocity.z, offset + 8);
            offset += 12;
        }

        data = data.slice(0, offset);

        let res = null;
        try {
            res = await this._send(7, data, 100);
        } catch { }
        return res;
    }

    data = new Map();
}

module.exports = Client;