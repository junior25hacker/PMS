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
import {
  CreateMedicineDto,
  MedicineQueryDto,
  UpdateMedicineDto,
} from './dto/medicine.dto';
import { MedicinesService } from './medicines.service';

@ApiTags('Medicines')
@ApiBearerAuth()
@Controller('medicines')
export class MedicinesController {
  constructor(private readonly medicinesService: MedicinesService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST)
  @ApiOperation({ summary: 'Create a medicine (product master record)' })
  create(@Body() dto: CreateMedicineDto) {
    return this.medicinesService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Paginated, filterable medicine catalog with live stock' })
  findAll(@Query() query: MedicineQueryDto) {
    return this.medicinesService.findAll(query);
  }

  @Get('alerts/low-stock')
  @ApiOperation({ summary: 'Products at or below their reorder level' })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  lowStock(@Query('limit') limit?: string) {
    return this.medicinesService.findLowStock(limit ? Number.parseInt(limit, 10) : 20);
  }

  @Get('alerts/expiring')
  @ApiOperation({ summary: 'Batches expiring inside the alert window' })
  @ApiQuery({ name: 'days', required: false, example: 90 })
  expiring(@Query('days') days?: string) {
    return this.medicinesService.findExpiringSoon(
      days ? Number.parseInt(days, 10) : undefined,
    );
  }

  @Get('stock-level')
  @ApiOperation({ summary: 'Aggregated inventory counters' })
  stockLevel() {
    return this.medicinesService.getStockLevel();
  }

  @Get('search')
  @ApiOperation({ summary: 'POS lookup by barcode, SKU, name or generic name' })
  @ApiQuery({ name: 'q', required: true, example: 'paracetamol' })
  search(@Query('q') term: string, @Query('limit') limit?: string) {
    return this.medicinesService.searchForPos(
      term ?? '',
      limit ? Number.parseInt(limit, 10) : 15,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fetch one medicine including all batches' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.medicinesService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST)
  @ApiOperation({ summary: 'Update a medicine' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateMedicineDto) {
    return this.medicinesService.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST)
  @ApiOperation({ summary: 'Discontinue a medicine (soft delete)' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.medicinesService.remove(id);
  }
}
