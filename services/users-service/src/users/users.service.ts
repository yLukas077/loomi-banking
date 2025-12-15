import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { User } from './entities/user.entity'
import { BankingDetails } from './entities/banking-details.entity'
import { CreateUserDto } from './dto/create-user.dto'
import { UpdateUserDto } from './dto/update-user.dto'
import { BankingDetailsDto } from './dto/banking-details.dto'
import { RabbitMQPublisher } from '../rabbitmq/rabbitmq.publisher'
import { RedisService } from '../redis/redis.service'
import { IdempotencyService } from '../common/idempotency/idempotency.service'

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(BankingDetails)
    private readonly bankingDetailsRepo: Repository<BankingDetails>,
    private readonly publisher: RabbitMQPublisher,
    private readonly redis: RedisService,
    private readonly idempotency: IdempotencyService,
  ) {}

  async create(data: CreateUserDto, idempotencyKey?: string) {
    if (idempotencyKey) {
      const cached = await this.idempotency.get(idempotencyKey)
      if (cached?.status === 'success') {
        return cached.data
      }
      if (cached?.status === 'pending') {
        return cached
      }
      await this.idempotency.save(idempotencyKey, { status: 'pending', data: null })
    }

    const exists = await this.usersRepo.findOne({ where: { email: data.email } })
    if (exists) {
      throw new ConflictException('Email already exists')
    }

    const user = this.usersRepo.create({
      ...data,
      balance: 0,
    })
    const saved = await this.usersRepo.save(user)

    await this.publisher.publish('user.created', {
      event: 'user.created',
      userId: saved.id,
      name: saved.name,
      email: saved.email,
      timestamp: new Date().toISOString(),
    })

    if (idempotencyKey) {
      await this.idempotency.save(idempotencyKey, { status: 'success', data: saved })
    }

    return saved
  }

  async findAll() {
    return this.usersRepo.find({
      order: { createdAt: 'DESC' },
      relations: ['bankingDetails'],
    })
  }

  async findById(id: string) {
    const cached = await this.redis.get(`user:${id}`)
    if (cached) return cached

    const user = await this.usersRepo.findOne({
      where: { id },
      relations: ['bankingDetails'],
    })

    if (!user) throw new NotFoundException('User not found')

    await this.redis.set(`user:${id}`, user, 300)

    return user
  }

  async getBalance(id: string) {
    const user = await this.usersRepo.findOne({ where: { id } })

    if (!user) throw new NotFoundException('User not found')

    return {
      userId: user.id,
      balance: Number(user.balance),
      updatedAt: user.updatedAt,
    }
  }

  async update(id: string, data: UpdateUserDto) {
    const user = await this.usersRepo.findOne({ where: { id } })
    if (!user) throw new NotFoundException('User not found')

    if (data.email && data.email !== user.email) {
      const emailExists = await this.usersRepo.findOne({ where: { email: data.email } })
      if (emailExists) {
        throw new ConflictException('Email already exists')
      }
    }

    Object.assign(user, data)
    const saved = await this.usersRepo.save(user)

    await this.redis.del(`user:${id}`)

    return saved
  }

  async setBankingDetails(userId: string, data: BankingDetailsDto) {
    const user = await this.usersRepo.findOne({
      where: { id: userId },
      relations: ['bankingDetails'],
    })

    if (!user) throw new NotFoundException('User not found')

    let details = user.bankingDetails

    if (details) {
      Object.assign(details, data)
    } else {
      details = this.bankingDetailsRepo.create({
        ...data,
        user,
      })
    }

    const saved = await this.bankingDetailsRepo.save(details)

    await this.publisher.publish('banking_details.updated', {
      event: 'banking_details.updated',
      userId: user.id,
      details: {
        agency: saved.agency,
        accountNumber: saved.accountNumber,
        accountType: saved.accountType,
      },
      timestamp: new Date().toISOString(),
    })

    await this.redis.del(`user:${userId}`)
    await this.redis.del(`user:${userId}:banking`)

    return saved
  }

  async delete(id: string) {
    const user = await this.usersRepo.findOne({ where: { id } })
    if (!user) throw new NotFoundException('User not found')

    await this.usersRepo.delete(id)
    await this.redis.del(`user:${id}`)

    return { deleted: true }
  }
}