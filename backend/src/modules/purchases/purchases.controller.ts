import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums';
import {
  CreatePurchaseOrderDto,
  PurchaseOrderQueryDto,
  ReceivePurchaseOrderDto,
  UpdatePurchaseOrderDto,
  UpdatePurchaseOrderStatusDto,
} from './dto/purchase-order.dto';
import { PurchasesService } from './purchases.service';

@ApiTags('Purchase Orders')
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.PHARMACIST)
@Controller('purchase-orders')
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  @Post()
  @ApiOperation({ summary: 'Raise a purchase order' })
  create(
    @Body() dto: CreatePurchaseOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.purchasesService.create(dto, user);
  }

  @Get()
  @ApiOperation({ summary: 'Paginated purchase orders' })
  findAll(@Query() query: PurchaseOrderQueryDto) {
    return this.purchasesService.findAll(query);
  }

  @Get('suggestions/low-stock')
  @ApiOperation({ summary: 'Get low stock medicines with recommended suppliers for restocking' })
  getLowStockSuggestions() {
    return this.purchasesService.getLowStockSuggestions();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fetch one purchase order with its lines' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.purchasesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit a draft purchase order' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePurchaseOrderDto,
  ) {
    return this.purchasesService.update(id, dto);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Move a purchase order through its lifecycle' })
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePurchaseOrderStatusDto,
  ) {
    return this.purchasesService.updateStatus(id, dto.status);
  }

  @Post(':id/receive')
  @ApiOperation({
    summary: 'Book goods in — creates stock batches and updates PO status',
  })
  receive(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReceivePurchaseOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.purchasesService.receive(id, dto, user);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel a purchase order' })
  cancel(@Param('id', ParseIntPipe) id: number) {
    return this.purchasesService.cancel(id);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Delete a draft purchase order (admin only)' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.purchasesService.remove(id);
  }
}
