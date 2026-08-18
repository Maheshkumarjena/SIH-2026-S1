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
  async requestsSummary() {
    console.log(`[AdminAnalyticsController.requestsSummary] 📊 Fetching requests summary analytics`);
    const result = await this.analytics.requestsSummary();
    console.log(`[AdminAnalyticsController.requestsSummary] ✅ Requests summary generated`);
    return result;
  }

  @Get('resolution-time')
  async resolutionTimeTrend() {
    console.log(`[AdminAnalyticsController.resolutionTimeTrend] 📈 Fetching resolution time trend`);
    const result = await this.analytics.resolutionTimeTrend();
    console.log(`[AdminAnalyticsController.resolutionTimeTrend] ✅ Resolution time trend generated`);
    return result;
  }

  @Get('bottlenecks')
  async bottlenecks() {
    console.log(`[AdminAnalyticsController.bottlenecks] ⏳ Fetching approval bottleneck analytics`);
    const result = await this.analytics.bottlenecks();
    console.log(`[AdminAnalyticsController.bottlenecks] ✅ Bottlenecks analytics generated`);
    return result;
  }

  @Get('policy-conflicts')
  async policyConflicts() {
    console.log(`[AdminAnalyticsController.policyConflicts] ⚠️ Fetching policy conflicts analytics`);
    const result = await this.analytics.policyConflicts();
    console.log(`[AdminAnalyticsController.policyConflicts] ✅ Policy conflicts analytics generated`);
    return result;
  }
}
