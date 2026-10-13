// TCP client for EffectCraft's control port.
//
// Protocol (docs/control-protocol.md in the EffectCraft repo): one JSON object
// per line in each direction over 127.0.0.1. Requests are
// {id, method, params}; replies are {id, ok: true, result} or
// {id, ok: false, error}. Replies on one connection come back in request
// order. A malformed line makes the app close the connection.

import net from 'node:net';

export const DEFAULT_HOST = '127.0.0.1';
export const DEFAULT_PORT = 9877;

export function configuredPort() {
  const raw = process.env.EFFECTCRAFT_CONTROL_PORT;
  const port = raw ? Number.parseInt(raw, 10) : DEFAULT_PORT;
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : DEFAULT_PORT;
}

export class BridgeError extends Error {
  constructor(message, { code = 'COMMAND_FAILED', method, command, details } = {}) {
    super(message);
    this.name = 'BridgeError';
    this.code = code;
    this.method = method;
    this.command = command;
    this.details = details;
  }
}

export class Bridge {
  constructor({ host = DEFAULT_HOST, port = configuredPort(), timeoutMs = 65_000, connectTimeoutMs = 3_000 } = {}) {
    this.host = host;
    this.port = port;
    this.timeoutMs = timeoutMs;
    this.connectTimeoutMs = connectTimeoutMs;
    this.socket = null;
    this.connecting = null;
    this.buffer = '';
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    if (this.socket) return this.socket;
    if (this.connecting) return this.connecting;
    this.connecting = new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: this.host, port: this.port });
      const timer = setTimeout(() => {
        socket.destroy();
        reject(this.#notRunning(new Error('connect timed out')));
      }, this.connectTimeoutMs);
      socket.setEncoding('utf8');
      socket.setNoDelay(true);
      socket.once('connect', () => {
        clearTimeout(timer);
        socket.removeAllListeners('error');
        socket.on('data', (chunk) => this.#onData(chunk));
        socket.on('error', (err) => this.#teardown(err));
        socket.on('close', () => this.#teardown(new Error('EffectCraft closed the control connection')));
        this.socket = socket;
        resolve(socket);
      });
      socket.once('error', (err) => {
        clearTimeout(timer);
        reject(this.#notRunning(err));
      });
    }).finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  // Low-level: send one control method and return the raw reply {ok, result, error}.
  async call(method, params = {}, { timeoutMs = this.timeoutMs } = {}) {
    const socket = await this.connect();
    const id = this.nextId++;
    const line = JSON.stringify({ id, method, params }) + '\n';
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new BridgeError(`EffectCraft did not answer \`${method}\` within ${Math.round(timeoutMs / 1000)}s`, { code: 'TIMEOUT', method }));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer, method });
      socket.write(line, (err) => {
        if (err) {
          clearTimeout(timer);
          this.pending.delete(id);
          reject(new BridgeError(`could not send \`${method}\`: ${err.message}`, { code: 'SEND_FAILED', method }));
        }
      });
    });
  }

  // Send a control method; throw BridgeError when the app reports ok: false.
  async request(method, params = {}, options) {
    const reply = await this.call(method, params, options);
    if (!reply.ok) throw new BridgeError(reply.error ?? `\`${method}\` failed`, { method });
    return reply.result;
  }

  // Run one engine command (the same ids as EffectCraft's menus and command palette).
  async exec(command, params = {}, options) {
    const reply = await this.call('engine.execute', { command, params }, options);
    if (!reply.ok) throw new BridgeError(reply.error ?? `\`${command}\` failed`, { method: 'engine.execute', command });
    return reply.result;
  }

  // Run several engine commands as one undo step. A string param "$N" or
  // "$N.key" refers to step N's result (1-based).
  async batch(steps, { label, atomic } = {}, options) {
    const params = { steps };
    if (label !== undefined) params.label = label;
    if (atomic !== undefined) params.atomic = atomic;
    return this.exec('engine.batch', params, options);
  }

  // Run JavaScript against EffectCraft's After Effects-style scripting model
  // (app, app.project, CompItem, Layer, Property...). Returns the script's
  // value; throws with the script error and console output when it fails.
  async script(code, { name } = {}, options) {
    const params = { code };
    if (name) params.name = name;
    const out = await this.exec('script.run', params, options);
    if (out && out.ok === false) {
      throw new BridgeError(`script error: ${out.error ?? 'unknown'}`, {
        method: 'engine.execute',
        command: 'script.run',
        details: { output: out.output },
      });
    }
    return out?.result;
  }

  async isReachable({ timeoutMs = 1_500 } = {}) {
    try {
      await this.call('engine.execute', { command: 'app.capabilities', params: {} }, { timeoutMs });
      return true;
    } catch {
      return false;
    }
  }

  setPort(port) {
    if (port === this.port) return;
    this.close();
    this.port = port;
  }

  close() {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.destroy();
    }
    this.#teardown(new Error('bridge closed'));
  }

  #onData(chunk) {
    this.buffer += chunk;
    let nl;
    while ((nl = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, nl).trim();
      this.buffer = this.buffer.slice(nl + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      const id = this.pending.has(msg.id) ? msg.id : this.#oldestPendingId(msg);
      if (id === undefined) continue;
      const entry = this.pending.get(id);
      clearTimeout(entry.timer);
      this.pending.delete(id);
      entry.resolve(msg);
    }
  }

  // A connection-level error reply (bad line, too many connections) may carry
  // no usable id; hand it to the oldest waiting request.
  #oldestPendingId(msg) {
    if (msg.id !== undefined && msg.id !== null) return undefined;
    const first = this.pending.keys().next();
    return first.done ? undefined : first.value;
  }

  #teardown(err) {
    this.socket = null;
    this.buffer = '';
    for (const [id, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(new BridgeError(`${err.message} (while waiting on \`${entry.method}\`)`, { code: 'DISCONNECTED', method: entry.method }));
      this.pending.delete(id);
    }
  }

  #notRunning(err) {
    return new BridgeError(
      `cannot reach EffectCraft on ${this.host}:${this.port} (${err.code ?? err.message}). ` +
        'Call check_setup, or launch_effectcraft to start the app with its control port open.',
      { code: 'NOT_RUNNING' },
    );
  }
}
