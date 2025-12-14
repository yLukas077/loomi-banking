import { Injectable, BadRequestException } from '@nestjs/common'
import { RedisService } from '../../redis/redis.service'

@Injectable()
export class IdempotencyService {
  constructor(private readonly redis: RedisService) {}

  async checkOrSave(key: string, payloadHash: string) {
    const cacheKey = `idem:${key}`

    const existing = await this.redis.get(cacheKey)
    if (existing) {
      if (existing.payloadHash !== payloadHash) {
        throw new BadRequestException('Idempotency-Key reused with different payload')
      }

      return existing.response
    }

    await this.redis.set(cacheKey, { payloadHash }, 60 * 5)

    return null
  }

  async saveResponse(key: string, response: any, payloadHash: string) {
    const cacheKey = `idem:${key}`
    await this.redis.set(cacheKey, { payloadHash, response }, 60 * 5)
  }
}
