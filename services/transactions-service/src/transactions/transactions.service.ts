import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Transaction, TransactionStatus } from './entities/transaction.entity'
import { CreateTransactionDto } from './dto/create-transaction.dto'

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactionsRepo: Repository<Transaction>,
  ) {}

  async create(data: CreateTransactionDto) {
    const tx = this.transactionsRepo.create({
      ...data,
      status: TransactionStatus.PENDING,
    })

    return this.transactionsRepo.save(tx)
  }

  async findAll() {
    return this.transactionsRepo.find({
      order: { createdAt: 'DESC' },
    })
  }

  async findById(id: string) {
    const tx = await this.transactionsRepo.findOne({ where: { id } })
    if (!tx) throw new NotFoundException('Transaction not found')
    return tx
  }

  async updateStatus(id: string, status: TransactionStatus) {
    const tx = await this.transactionsRepo.findOne({ where: { id } })
    if (!tx) throw new NotFoundException('Transaction not found')

    tx.status = status
    return this.transactionsRepo.save(tx)
    }
}
