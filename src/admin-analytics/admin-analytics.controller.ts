import { Controller, Get, UseGuards } from '@nestjs/common';
import { MockJwtAuthGuard } from '../common/guards/mock-jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { AdminAnalyticsService } from './admin-analytics.service';

@UseGuards(MockJwtAuthGuard)
@Roles('admin')
@Controller('admin/analytics')
export class AdminAnalyticsController {
  constructor(private readonly analytics: AdminAnalyticsService) {}

  @Get('requests-summary')
  requestsSummary() {
    return this.analytics.requestsSummary();
  }

  @Get('resolution-time')
  resolutionTimeTrend() {
    return this.analytics.resolutionTimeTrend();
  }

  @Get('bottlenecks')
  bottlenecks() {
    return this.analytics.bottlenecks();
  }

  @Get('policy-conflicts')
  policyConflicts() {
    return this.analytics.policyConflicts();
  }
}
