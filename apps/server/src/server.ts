import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { ROOM_NAME } from '@nishi/shared';
import { NishiRoom } from './NishiRoom';

export function createServer() {
  const server = new Server({ transport: new WebSocketTransport({ pingInterval: 5000, pingMaxRetries: 3 }) });
  server.define(ROOM_NAME, NishiRoom);
  return server;
}
