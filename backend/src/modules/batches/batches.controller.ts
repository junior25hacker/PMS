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
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums';
import { BatchesService } from './batches.service';
import {
  AdjustStockDto,
  BatchQueryDto,
  CreateBatchDto,
  UpdateBatchDto,
} from './dto/batch.dto';

@ApiTags('Batches')
@ApiBearerAuth()
@Controller('batches')
export class BatchesController {
  constructor(private readonly batchesService: BatchesService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST)
  @ApiOperation({ summary: 'Receive a new batch of stock' })
  create(@Body() dto: CreateBatchDto) {
    return this.batchesService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List batches (filter by medicine, expiry window)' })
  findAll(@Query() query: BatchQueryDto) {
    return this.batchesService.findAll(query);
  }

  @Get('fefo/:medicineId')
  @ApiOperation({
    summary: 'Batches of a medicine ordered First-Expiry-First-Out',
  })
  @ApiQuery({ name: 'includeEmpty', required: false })
  fefoQueue(
    @Param('medicineId', ParseIntPipe) medicineId: number,
    @Query('includeEmpty') includeEmpty?: string,
  ) {
    return this.batchesService.findFefoQueue(medicineId, includeEmpty === 'true');
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fetch a single batch' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.batchesService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST)
  @ApiOperation({ summary: 'Update batch metadata or pricing' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateBatchDto) {
    return this.batchesService.update(id, dto);
  }

  @Patch(':id/adjust')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST)
  @ApiOperation({ summary: 'Apply a signed stock adjustment to a batch' })
  adjust(@Param('id', ParseIntPipe) id: number, @Body() dto: AdjustStockDto) {
    return this.batchesService.adjustStock(id, dto);
  }

  @Post(':id/write-off')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST)
  @ApiOperation({ summary: 'Write off all remaining stock (expired / recalled)' })
  writeOff(@Param('id', ParseIntPipe) id: number, @Body('reason') reason?: string) {
    return this.batchesService.writeOff(id, reason);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST)
  @ApiOperation({ summary: 'Delete an empty batch' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.batchesService.remove(id);
  }
}
