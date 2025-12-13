import { Injectable, OnModuleInit } from '@nestjs/common'
import { createClient, RedisClientType } from 'redis'

@Injectable()
export class RedisService implements OnModuleInit {
  private client: RedisClientType

  async onModuleInit() {
    this.client = createClient({
      url: process.env.REDIS_URL,
    })

    this.client.on('error', (err) =>
      console.error('Redis Client Error', err),
    )

    await this.client.connect()

    console.log('[Redis] Connected')
  }

  async get(key: string) {
    return this.client.get(key)
  }

  async set(key: string, value: any, ttlSeconds = 60) {
    return this.client.set(key, JSON.stringify(value), {
      EX: ttlSeconds,
    })
  }

  async del(key: string) {
    return this.client.del(key)
  }
}
