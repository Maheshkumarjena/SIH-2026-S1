import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ namespace: '/ws', cors: { origin: true, credentials: true } })
export class RealtimeGateway implements OnGatewayConnection {
  @WebSocketServer()
  server?: Server;

  handleConnection(client: Socket): void {
    const userId = this.readHandshakeValue(client, 'user_id') ?? this.readHandshakeValue(client, 'userId');
    const sessionId = this.readHandshakeValue(client, 'session_id') ?? this.readHandshakeValue(client, 'sessionId');
    if (userId) {
      void client.join(`user:${userId}`);
    }
    if (sessionId) {
      void client.join(`agent_session:${sessionId}`);
    }
  }

  emitToUser(userId: string, type: string, payload: object): void {
    this.server?.to(`user:${userId}`).emit('event', { type, payload });
  }

  emitToSession(sessionId: string, type: string, payload: object): void {
    this.server?.to(`agent_session:${sessionId}`).emit('event', { type, payload });
  }

  private readHandshakeValue(client: Socket, key: string): string | undefined {
    const value = client.handshake.query[key] ?? client.handshake.auth?.[key];
    return typeof value === 'string' ? value : undefined;
  }
}
