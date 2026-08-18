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
  async start(@CurrentUser() user: AuthenticatedUser, @Body() dto: StartAgentSessionDto) {
    console.log(`[AgentController.start] 🤖 Starting agent session for user: ${user.id} (${user.role}), language: ${dto.language ?? user.preferred_language}`);
    const result = await this.sessions.start(user, dto);
    console.log(`[AgentController.start] ✅ Agent session started:`, (result as { id?: string })?.id ?? 'created');
    return result;
  }

  @Post(':id/message')
  async postMessage(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: PostAgentMessageDto) {
    console.log(`[AgentController.postMessage] 💬 User ${user.id} sending message to agent session ${id}: "${dto.content.slice(0, 100)}${dto.content.length > 100 ? '...' : ''}"`);
    const result = await this.sessions.postMessage(id, user, dto);
    console.log(`[AgentController.postMessage] ✅ Agent responded for session ${id}`);
    return result;
  }

  @Get(':id')
  async getHistory(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    console.log(`[AgentController.getHistory] 📜 User ${user.id} fetching conversation history for session ${id}`);
    const result = await this.sessions.getHistory(id, user);
    console.log(`[AgentController.getHistory] ✅ History fetched for session ${id}`);
    return result;
  }

  @Get(':id/plan')
  async getPlan(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    console.log(`[AgentController.getPlan] 🗺️ User ${user.id} fetching execution plan for session ${id}`);
    const result = await this.sessions.getPlan(id, user);
    console.log(`[AgentController.getPlan] ✅ Plan fetched for session ${id}`);
    return result;
  }
}
