import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/current-user.decorator';
import { MockJwtAuthGuard } from '../common/guards/mock-jwt-auth.guard';
import { AuthenticatedUser } from '../common/types';
import { AgentSessionsService } from './agent-sessions.service';
import { PostAgentMessageDto, StartAgentSessionDto } from './dto';

@UseGuards(MockJwtAuthGuard)
@Controller('agent/session')
export class AgentController {
  constructor(private readonly sessions: AgentSessionsService) {}

  @Post()
  start(@CurrentUser() user: AuthenticatedUser, @Body() dto: StartAgentSessionDto) {
    return this.sessions.start(user, dto);
  }

  @Post(':id/message')
  postMessage(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: PostAgentMessageDto) {
    return this.sessions.postMessage(id, user, dto);
  }

  @Get(':id')
  getHistory(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.sessions.getHistory(id, user);
  }

  @Get(':id/plan')
  getPlan(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.sessions.getPlan(id, user);
  }
}
