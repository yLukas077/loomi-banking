import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Headers,
} from '@nestjs/common'
import { UsersService } from './users.service'
import { CreateUserDto } from './dto/create-user.dto'
import { UpdateUserDto } from './dto/update-user.dto'
import { BankingDetailsDto } from './dto/banking-details.dto'
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger'

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new user' })
  @ApiResponse({ status: 201, description: 'User created successfully' })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  @ApiHeader({
    name: 'idempotency-key',
    description: 'Unique key to prevent duplicated user submissions',
    required: false,
  })
  async createUser(
    @Body() body: CreateUserDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.usersService.create(body, idempotencyKey)
  }

  @Get()
  @ApiOperation({ summary: 'List all users' })
  @ApiResponse({ status: 200 })
  async getAllUsers() {
    return this.usersService.findAll()
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a user by id' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getUser(@Param('id') id: string) {
    return this.usersService.findById(id)
  }

  @Get(':id/balance')
  @ApiOperation({ summary: 'Get user balance' })
  @ApiResponse({ status: 200, description: 'Returns user balance' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getBalance(@Param('id') id: string) {
    return this.usersService.getBalance(id)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a user' })
  @ApiResponse({ status: 200, description: 'User updated successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  async updateUser(@Param('id') id: string, @Body() body: UpdateUserDto) {
    return this.usersService.update(id, body)
  }

  @Patch(':id/banking-details')
  @ApiOperation({ summary: 'Set or update banking details' })
  @ApiResponse({ status: 200, description: 'Banking details updated successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async setBankingDetails(
    @Param('id') id: string,
    @Body() body: BankingDetailsDto,
  ) {
    return this.usersService.setBankingDetails(id, body)
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a user' })
  @ApiResponse({ status: 200, description: 'User deleted successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async deleteUser(@Param('id') id: string) {
    return this.usersService.delete(id)
  }
}