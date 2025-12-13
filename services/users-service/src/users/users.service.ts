import { Injectable, ConflictException, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { User } from './user.entity'
import { CreateUserDto } from './dto/create-user.dto'
import { UpdateUserDto } from './dto/update-user.dto'

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepo: Repository<User>,
  ) {}

  async create(data: CreateUserDto) {
    const exists = await this.usersRepo.findOne({ where: { email: data.email } })

    if (exists) {
      throw new ConflictException('Email já está em uso')
    }

    const user = this.usersRepo.create(data)
    return this.usersRepo.save(user)
  }

  async findById(id: string) {
    const user = await this.usersRepo.findOne({
      where: { id },
      relations: ['bankingDetails'],
    })

    if (!user) throw new NotFoundException('User not found')

    return user
  }

  async delete(id: string) {
    const user = await this.usersRepo.findOne({ where: { id } })

    if (!user) {
      throw new NotFoundException('User not found')
    }

    await this.usersRepo.delete(id)

    return true
  }

  async update(id: string, data: UpdateUserDto) {
    const user = await this.usersRepo.findOne({ where: { id } })

    if (!user) {
      throw new NotFoundException('User not found')
    }

    if (data.email && data.email !== user.email) {
      const emailInUse = await this.usersRepo.findOne({
        where: { email: data.email },
      })

      if (emailInUse) {
        throw new ConflictException('Email já está em uso')
      }
    }

    const updated = Object.assign(user, data)

    return this.usersRepo.save(updated)
  }


}
