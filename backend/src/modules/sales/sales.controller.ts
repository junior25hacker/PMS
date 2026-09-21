import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums';
import { CreateSaleDto } from './dto/create-sale.dto';
import { EmailReceiptDto } from './dto/email-receipt.dto';
import { SaleQueryDto } from './dto/sale-query.dto';
import { SalesService } from './sales.service';

@ApiTags('Sales & POS')
@ApiBearerAuth()
@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.CASHIER, UserRole.PHARMACIST)
  @ApiOperation({
    summary: 'Check out a cart — deducts stock (FEFO) and stores the receipt',
  })
  create(@Body() dto: CreateSaleDto, @CurrentUser() user: AuthenticatedUser) {
    return this.salesService.create(dto, user);
  }

  @Get()
  @ApiOperation({ summary: 'Paginated sales history with filters' })
  findAll(@Query() query: SaleQueryDto) {
    return this.salesService.findAll(query);
  }

  @Get('summary/today')
  @ApiOperation({ summary: "Today's sales summary" })
  @ApiQuery({ name: 'date', required: false, example: '2026-09-15' })
  dailySummary(@Query('date') date?: string) {
    return this.salesService.getDailySummary(date);
  }

  @Get('summary/trend')
  @ApiOperation({ summary: 'Revenue trend for the last N days' })
  @ApiQuery({ name: 'days', required: false, example: 7 })
  trend(@Query('days') days?: string) {
    return this.salesService.getSalesTrend(days ? Number.parseInt(days, 10) : 7);
  }

  @Get('summary/top-products')
  @ApiOperation({ summary: 'Best-selling products' })
  @ApiQuery({ name: 'limit', required: false, example: 5 })
  @ApiQuery({ name: 'days', required: false, example: 30 })
  topProducts(@Query('limit') limit?: string, @Query('days') days?: string) {
    return this.salesService.getTopProducts(
      limit ? Number.parseInt(limit, 10) : 5,
      days ? Number.parseInt(days, 10) : 30,
    );
  }

  @Get('invoice/:invoiceNumber')
  @ApiOperation({ summary: 'Find a sale by its invoice number' })
  findByInvoice(@Param('invoiceNumber') invoiceNumber: string) {
    return this.salesService.findByInvoice(invoiceNumber);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fetch one sale' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.salesService.findOne(id);
  }

  @Get(':id/receipt')
  @ApiOperation({ summary: 'Printable receipt payload for a sale' })
  receipt(@Param('id', ParseIntPipe) id: number) {
    return this.salesService.getReceipt(id);
  }

  @Post(':id/receipt/email')
  @Roles(UserRole.ADMIN, UserRole.CASHIER, UserRole.PHARMACIST)
  @ApiOperation({ summary: 'Email a sale receipt to the customer' })
  emailReceipt(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EmailReceiptDto,
  ) {
    return this.salesService.emailReceipt(id, dto.email);
  }

  @Post(':id/refund')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST)
  @ApiOperation({ summary: 'Refund a sale and return the stock to its batches' })
  refund(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.salesService.refund(id, user);
  }
}
