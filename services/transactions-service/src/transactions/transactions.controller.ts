import { Body, Controller, Get, Param, Patch, Post, Headers } from '@nestjs/common'
import { TransactionsService } from './transactions.service'
import { CreateTransactionDto } from './dto/create-transaction.dto'
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger'
import { UpdateTransactionStatusDto } from './dto/update-status.dto'

@ApiTags('Transactions')
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new transaction' })
  @ApiResponse({ status: 201, description: 'Transaction created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid data or missing banking details' })
  @ApiHeader({
    name: 'idempotency-key',
    description: 'Unique key to prevent duplicated transaction submissions',
    required: false,
  })
  async create(
    @Body() body: CreateTransactionDto,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.transactionsService.create(body, key)
  }

  @Get()
  @ApiOperation({ summary: 'List all transactions' })
  @ApiResponse({ status: 200 })
  async findAll() {
    return this.transactionsService.findAll()
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a transaction by id' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  async findById(@Param('id') id: string) {
    return this.transactionsService.findById(id)
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'List all transactions for a specific user' })
  @ApiResponse({ status: 200, description: 'Transactions retrieved successfully' })
  async findByUser(@Param('userId') userId: string) {
    return this.transactionsService.findByUser(userId)
  }
  
  @Patch(':id/status')
  @ApiOperation({ summary: 'Update the status of a transaction' })
  @ApiResponse({ status: 200, description: 'Transaction status updated successfully' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  async updateStatus(
    @Param('id') id: string,
    @Body() body: UpdateTransactionStatusDto,
  ) {
    return this.transactionsService.updateStatus(id, body.status)
  }
}
