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

    // Validate based on transaction type
    await this.validateTransaction(data)

    const tx = this.transactionsRepo.create({
      senderUserId: data.senderUserId,
      receiverUserId: data.receiverUserId,
      type: data.type,
      amount: data.amount,
      description: data.description,
      status: TransactionStatus.PENDING,
    })

    const saved = await this.transactionsRepo.save(tx)

    await this.publisher.publish('transaction.created', {
      event: 'transaction.created',
      transactionId: saved.id,
      senderUserId: saved.senderUserId,
      receiverUserId: saved.receiverUserId,
      type: saved.type,
      amount: Number(saved.amount),
      timestamp: new Date().toISOString(),
    })

    if (idempotencyKey) {
      await this.idempotency.saveResponse(idempotencyKey, saved, payloadHash)
    }

    return saved
  }

  private async validateTransaction(data: CreateTransactionDto) {
    switch (data.type) {
      case TransactionType.DEPOSIT:
        await this.validateDeposit(data)
        break
      case TransactionType.WITHDRAW:
        await this.validateWithdraw(data)
        break
      case TransactionType.TRANSFER:
        await this.validateTransfer(data)
        break
    }
  }

  private async validateDeposit(data: CreateTransactionDto) {
    if (!data.receiverUserId) {
      throw new BadRequestException('receiverUserId is required for deposit')
    }

    const receiver = await this.redis.get(`user:${data.receiverUserId}`)
    if (!receiver) {
      throw new BadRequestException('Receiver user does not exist')
    }
  }

  private async validateWithdraw(data: CreateTransactionDto) {
    if (!data.senderUserId) {
      throw new BadRequestException('senderUserId is required for withdraw')
    }

    const sender = await this.redis.get(`user:${data.senderUserId}`)
    if (!sender) {
      throw new BadRequestException('Sender user does not exist')
    }

    const banking = await this.redis.get(`user:${data.senderUserId}:banking`)
    if (!banking) {
      throw new BadRequestException('Sender has no banking details configured')
    }

    if (!banking.accountNumber || !banking.agency || !banking.accountType) {
      throw new BadRequestException('Sender banking details are incomplete')
    }
  }

  private async validateTransfer(data: CreateTransactionDto) {
    if (!data.senderUserId) {
      throw new BadRequestException('senderUserId is required for transfer')
    }

    if (!data.receiverUserId) {
      throw new BadRequestException('receiverUserId is required for transfer')
    }

    if (data.senderUserId === data.receiverUserId) {
      throw new BadRequestException('Cannot transfer to the same account')
    }

    // Validate sender
    const sender = await this.redis.get(`user:${data.senderUserId}`)
    if (!sender) {
      throw new BadRequestException('Sender user does not exist')
    }

    const senderBanking = await this.redis.get(`user:${data.senderUserId}:banking`)
    if (!senderBanking) {
      throw new BadRequestException('Sender has no banking details configured')
    }

    if (!senderBanking.accountNumber || !senderBanking.agency || !senderBanking.accountType) {
      throw new BadRequestException('Sender banking details are incomplete')
    }

    // Validate receiver
    const receiver = await this.redis.get(`user:${data.receiverUserId}`)
    if (!receiver) {
      throw new BadRequestException('Receiver user does not exist')
    }

    const receiverBanking = await this.redis.get(`user:${data.receiverUserId}:banking`)
    if (!receiverBanking) {
      throw new BadRequestException('Receiver has no banking details configured')
    }
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

  async findByUser(userId: string) {
    return this.transactionsRepo.find({
      where: [
        { senderUserId: userId },
        { receiverUserId: userId },
      ],
      order: { createdAt: 'DESC' },
    })
  }

  async updateStatus(id: string, status: TransactionStatus) {
    const tx = await this.transactionsRepo.findOne({ where: { id } })
    if (!tx) throw new NotFoundException('Transaction not found')

    tx.status = status
    const saved = await this.transactionsRepo.save(tx)

    // IMPORTANTE: Incluir type e amount no evento!
    await this.publisher.publish('transaction.status_updated', {
      event: 'transaction.status_updated',
      transactionId: saved.id,
      senderUserId: saved.senderUserId,
      receiverUserId: saved.receiverUserId,
      type: saved.type,
      amount: Number(saved.amount),
      newStatus: saved.status,
      timestamp: new Date().toISOString(),
    })

    return saved
  }
}