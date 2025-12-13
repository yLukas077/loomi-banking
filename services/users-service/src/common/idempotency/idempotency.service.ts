import { Injectable } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';

@Injectable()
export class IdempotencyService {
  constructor(private readonly redis: RedisService) {}

  async get(key: string) {
    const data = await this.redis.get(`idemp:users:${key}`);
    return data ? JSON.parse(data) : null;
  }

  async save(key: string, value: any) {
    await this.redis.set(`idemp:users:${key}`, value, 600); // 10 min
  }
}
