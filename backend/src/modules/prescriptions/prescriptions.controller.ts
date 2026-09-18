import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums';
import {
  CheckPrescriptionAllergiesDto,
  CreatePrescriptionDto,
  PrescriptionQueryDto,
  UpdatePrescriptionStatusDto,
} from './dto/prescription.dto';
import { PrescriptionsService } from './prescriptions.service';

@ApiTags('Prescriptions')
@ApiBearerAuth()
@Controller('prescriptions')
export class PrescriptionsController {
  constructor(private readonly prescriptionsService: PrescriptionsService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST)
  @ApiOperation({
    summary:
      'Record a new prescription linked to a patient with allergy checking and acknowledgment logging',
  })
  create(
    @Body() dto: CreatePrescriptionDto,
    @CurrentUser() user: any,
  ) {
    return this.prescriptionsService.create(dto, user);
  }

  @Post('check-allergies')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST)
  @ApiOperation({
    summary:
      'Pre-check prescription medications against patient known allergies',
  })
  checkAllergies(@Body() dto: CheckPrescriptionAllergiesDto) {
    return this.prescriptionsService.checkAllergies(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List prescriptions with filters' })
  findAll(@Query() query: PrescriptionQueryDto) {
    return this.prescriptionsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fetch single prescription details' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.prescriptionsService.findOne(id);
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST)
  @ApiOperation({ summary: 'Update prescription status (approve/dispense/cancel)' })
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePrescriptionStatusDto,
  ) {
    return this.prescriptionsService.updateStatus(id, dto);
  }
}
