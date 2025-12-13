import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { User } from './entities/user.entity'
import { CreateUserDto } from './dto/create-user.dto'
import { UpdateUserDto } from './dto/update-user.dto'
import { BankingDetails } from './entities/banking-details.entity'
import { BankingDetailsDto } from './dto/banking-details.dto'
import { RabbitMQPublisher } from '../rabbitmq/rabbitmq.publisher'
import { RedisService } from 'src/redis/redis.service'
import { IdempotencyService } from 'src/common/idempotency/idempotency.service'

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepo: Repository<User>,

    @InjectRepository(BankingDetails)
    private detailsRepo: Repository<BankingDetails>,

    private readonly publisher: RabbitMQPublisher,
    private readonly redis: RedisService,
    private readonly idempotency: IdempotencyService,
  ) {}

  async create(data: CreateUserDto, idempotencyKey?: string | null) {

    if (idempotencyKey) {
      const cached = await this.idempotency.get(idempotencyKey)
      if (cached?.status === 'success') {
        return cached.data
      }

      await this.idempotency.save(idempotencyKey, {
        status: 'pending',
        data: null,
        createdAt: new Date().toISOString(),
      })
    }

    const exists = await this.usersRepo.findOne({ where: { email: data.email } })
    if (exists) throw new ConflictException('Email já está em uso')

    const user = this.usersRepo.create(data)
    const saved = await this.usersRepo.save(user)

    await this.publisher.publish('user.created', {
      event: 'user.created',
      userId: saved.id,
      name: saved.name,
      email: saved.email,
      timestamp: new Date().toISOString(),
    })

    if (idempotencyKey) {
      await this.idempotency.save(idempotencyKey, {
        status: 'success',
        data: saved,
        createdAt: new Date().toISOString(),
      })
    }

    return saved
  }

  async findById(id: string) {
    const cacheKey = `users:${id}`

    const cached = await this.redis.get(cacheKey)
    if (cached) return JSON.parse(cached)

    const user = await this.usersRepo.findOne({
      where: { id },
      relations: ['bankingDetails'],
    })

    if (!user) throw new NotFoundException('User not found')

    await this.redis.set(cacheKey, user, 60)

    return user
  }

  async findAll() {
    return this.usersRepo.find({
      relations: ['bankingDetails'],
      order: { createdAt: 'DESC' },
    })
  }

  async update(id: string, data: UpdateUserDto) {
    const user = await this.usersRepo.findOne({ where: { id } })
    if (!user) throw new NotFoundException('User not found')

    if (data.email && data.email !== user.email) {
      const exists = await this.usersRepo.findOne({ where: { email: data.email } })
      if (exists) throw new ConflictException('Email já está em uso')
    }

    const updated = Object.assign(user, data)
    const saved = await this.usersRepo.save(updated)

    await this.redis.del(`users:${id}`)

    return saved
  }

  async delete(id: string) {
    const user = await this.usersRepo.findOne({ where: { id } })
    if (!user) throw new NotFoundException('User not found')

    await this.usersRepo.delete(id)
    await this.redis.del(`users:${id}`)

    return true
  }

  async setBankingDetails(userId: string, data: BankingDetailsDto) {
    const user = await this.usersRepo.findOne({
      where: { id: userId },
      relations: ['bankingDetails'],
    })

    if (!user) throw new NotFoundException('User not found')

    let result: BankingDetails

    if (user.bankingDetails) {
      Object.assign(user.bankingDetails, data)
      result = await this.detailsRepo.save(user.bankingDetails)
    } else {
      const newDetails = this.detailsRepo.create({ ...data, user, userId: user.id })
      result = await this.detailsRepo.save(newDetails)
    }

    await this.publisher.publish('banking_details.updated', {
      event: 'banking_details.updated',
      userId: user.id,
      details: {
        agency: result.agency,
        accountNumber: result.accountNumber,
        accountType: result.accountType,
      },
      timestamp: new Date().toISOString(),
    })

    await this.redis.del(`users:${userId}`)

    return result
  }
}
