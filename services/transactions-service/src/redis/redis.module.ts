import { Module } from '@nestjs/common'
import { RedisService } from './redis.service'
import { createClient } from 'redis'

@Module({
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: async () => {
        const client = createClient({
          url: process.env.REDIS_URL,
        })

        client.on('error', err => console.error('[Redis Error]', err))

        await client.connect()

        console.log('[Redis] Connected (Transactions)')
        return client
      },
    },
    RedisService,
  ],
  exports: [RedisService],
})
export class RedisModule {}
