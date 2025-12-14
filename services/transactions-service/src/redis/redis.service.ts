import { Inject, Injectable } from '@nestjs/common'
import type { RedisClientType } from 'redis'

@Injectable()
export class RedisService {
  constructor(
    @Inject('REDIS_CLIENT')
    private readonly client: RedisClientType,
  ) {}

  async set(key: string, value: any, ttlSeconds: number = 60) {
    const payload = JSON.stringify(value)
    await this.client.set(key, payload, { EX: ttlSeconds })
  }

  async get(key: string) {
    const data = await this.client.get(key)
    return data ? JSON.parse(data) : null
  }

  async del(key: string) {
    await this.client.del(key)
  }
}
