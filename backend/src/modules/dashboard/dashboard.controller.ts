import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('overview')
  @ApiOperation({
    summary: 'KPIs, alerts, trend, recent sales and best sellers in one call',
  })
  @ApiQuery({ name: 'trendDays', required: false, example: 7 })
  @ApiQuery({ name: 'alertLimit', required: false, example: 6 })
  overview(
    @Query('trendDays') trendDays?: string,
    @Query('alertLimit') alertLimit?: string,
  ) {
    return this.dashboardService.getOverview(
      trendDays ? Number.parseInt(trendDays, 10) : 7,
      alertLimit ? Number.parseInt(alertLimit, 10) : 6,
    );
  }

  @Get('order-stats')
  @ApiOperation({ summary: 'Completed / pending / cancelled counters' })
  orderStats() {
    return this.dashboardService.getOrderStats();
  }

  @Get('search')
  @ApiOperation({ summary: 'Global search across invoices and products' })
  @ApiQuery({ name: 'q', required: true })
  search(@Query('q') term: string) {
    return this.dashboardService.globalSearch(term ?? '');
  }
}
