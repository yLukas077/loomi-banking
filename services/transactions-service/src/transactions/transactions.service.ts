import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Transaction, TransactionStatus, TransactionType } from './entities/transaction.entity'
import { CreateTransactionDto } from './dto/create-transaction.dto'
import { RedisService } from '../redis/redis.service'
import { RabbitMQPublisher } from '../rabbitmq/rabbitmq.publisher'
import { IdempotencyService } from '../common/idempotency/idempotency.service'
import { createHash } from 'crypto'

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactionsRepo: Repository<Transaction>,

    private readonly publisher: RabbitMQPublisher,

    private readonly redis: RedisService,

    private readonly idempotency: IdempotencyService,
  ) {}

  async create(data: CreateTransactionDto, idempotencyKey?: string) {
    const payloadHash = createHash('sha256')
      .update(JSON.stringify(data))
      .digest('hex')

    if (idempotencyKey) {
      const cached = await this.idempotency.checkOrSave(idempotencyKey, payloadHash)
      if (cached) return cached
    }

    const user = await this.redis.get(`user:${data.userId}`)
    if (!user) {
      throw new BadRequestException('User does not exist')
    }

    if (data.type === TransactionType.WITHDRAW || data.type === TransactionType.TRANSFER) {
      const banking = await this.redis.get(`user:${data.userId}:banking`) as {
        agency: string
        accountNumber: string
        accountType: string
      } | null

      if (!banking) {
        throw new BadRequestException('User has no banking details configured')
      }

      if (!banking.accountNumber || !banking.agency || !banking.accountType) {
        throw new BadRequestException('User banking details are incomplete')
      }
    }

    const tx = this.transactionsRepo.create({
      ...data,
      status: TransactionStatus.PENDING,
    })

    const saved = await this.transactionsRepo.save(tx)

    await this.publisher.publish('transaction.created', {
      event: 'transaction.created',
      transactionId: saved.id,
      userId: saved.userId,
      type: saved.type,
      amount: saved.amount,
      timestamp: new Date().toISOString(),
    })

    if (idempotencyKey) {
      await this.idempotency.saveResponse(idempotencyKey, saved, payloadHash)
    }

    return saved
  }

  async findAll() {
    return this.transactionsRepo.find({
      order: { createdAt: 'DESC' },
    })
  }

  async findByUser(userId: string) {
    return this.transactionsRepo.find({
      where: { userId },
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
    const saved = await this.transactionsRepo.save(tx)

    await this.publisher.publish('transaction.status_updated', {
      event: 'transaction.status_updated',
      transactionId: saved.id,
      userId: saved.userId,
      newStatus: saved.status,
      timestamp: new Date().toISOString(),
    })

    return saved
  }
}
