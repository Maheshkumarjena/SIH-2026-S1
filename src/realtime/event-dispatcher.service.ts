import { Injectable } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';

@Injectable()
export class EventDispatcherService {
  constructor(private readonly gateway: RealtimeGateway) {}

  emitToSession(sessionId: string, type: string, payload: object): void {
    this.gateway.emitToSession(sessionId, type, payload);
  }

  emitToUser(userId: string, type: string, payload: object): void {
    this.gateway.emitToUser(userId, type, payload);
  }
}
