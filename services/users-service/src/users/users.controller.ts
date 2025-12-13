import { Body, Controller, Get, Param, Patch, Post, Delete } from '@nestjs/common'
import { UsersService } from './users.service'
import { CreateUserDto } from './dto/create-user.dto'
import { UpdateUserDto } from './dto/update-user.dto'

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  async createUser(@Body() body: CreateUserDto) {
    return this.usersService.create(body)
  }

  @Get(':id')
  async getUser(@Param('id') id: string) {
    return this.usersService.findById(id)
  }

  @Get()
  async getAllUsers() {
    return this.usersService.findAll()
  }


  @Patch(':id')
  async updateUser(@Param('id') id: string, @Body() body: UpdateUserDto) {
    return this.usersService.update(id, body)
  }

  @Delete(':id')
  async deleteUser(@Param('id') id: string) {
    await this.usersService.delete(id)
    return
  }
}
