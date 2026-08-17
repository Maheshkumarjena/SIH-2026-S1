import { Module } from '@nestjs/common';
import { EventDispatcherService } from './event-dispatcher.service';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  providers: [RealtimeGateway, EventDispatcherService],
  exports: [EventDispatcherService],
})
export class RealtimeModule {}
