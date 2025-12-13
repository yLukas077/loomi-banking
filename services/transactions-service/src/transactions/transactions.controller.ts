import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common'
import { TransactionsService } from './transactions.service'
import { CreateTransactionDto } from './dto/create-transaction.dto'
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger'
import { UpdateTransactionStatusDto } from './dto/update-status.dto'

@ApiTags('Transactions')
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new transaction' })
  @ApiResponse({ status: 201 })
  async create(@Body() body: CreateTransactionDto) {
    return this.transactionsService.create(body)
  }

  @Get()
  @ApiOperation({ summary: 'List all transactions' })
  async findAll() {
    return this.transactionsService.findAll()
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a transaction by id' })
  async findById(@Param('id') id: string) {
    return this.transactionsService.findById(id)
  }

  @Patch(':id/status')
    async updateStatus(
    @Param('id') id: string,
    @Body() body: UpdateTransactionStatusDto,
    ) {
    return this.transactionsService.updateStatus(id, body.status)
  }

}
