  import { Body, Controller, Get, Param, Patch, Post, Delete, Headers } from '@nestjs/common';
  import { UsersService } from './users.service';
  import { CreateUserDto } from './dto/create-user.dto';
  import { UpdateUserDto } from './dto/update-user.dto';
  import { BankingDetailsDto } from './dto/banking-details.dto';
  import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

  @ApiTags('Users')
  @Controller('users')
  export class UsersController {
    delete(userId: string) {
        throw new Error('Method not implemented.');
    }
    constructor(private readonly usersService: UsersService) {}

    @Post()
    @ApiOperation({ summary: 'Create a new user (idempotent)' })
    @ApiResponse({ status: 201, description: 'User created successfully' })
    @ApiResponse({ status: 409, description: 'Email already in use' })
    async createUser(
      @Body() body: CreateUserDto,
      @Headers('idempotency-key') idempotencyKey: string
    ) {
      return this.usersService.create(body, idempotencyKey || null);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get a user by id' })
    @ApiResponse({ status: 200, description: 'User found' })
    @ApiResponse({ status: 404, description: 'User not found' })
    async getUser(@Param('id') id: string) {
      return this.usersService.findById(id);
    }

    @Get()
    @ApiOperation({ summary: 'List all users' })
    @ApiResponse({ status: 200, description: 'Users list returned successfully' })
    async getAllUsers() {
      return this.usersService.findAll();
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Update a user' })
    @ApiResponse({ status: 200, description: 'User updated successfully' })
    @ApiResponse({ status: 404, description: 'User not found' })
    @ApiResponse({ status: 409, description: 'Email already in use' })
    async updateUser(@Param('id') id: string, @Body() body: UpdateUserDto) {
      return this.usersService.update(id, body);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete a user' })
    @ApiResponse({ status: 200, description: 'User deleted successfully' })
    @ApiResponse({ status: 404, description: 'User not found' })
    async deleteUser(@Param('id') id: string) {
      await this.usersService.delete(id);
      return { deleted: true };
    }

    @Patch(':id/banking-details')
    @ApiOperation({ summary: 'Set or update banking details for a user' })
    @ApiResponse({ status: 200, description: 'Banking details saved successfully' })
    @ApiResponse({ status: 404, description: 'User not found' })
    async setBankingDetails(@Param('id') id: string, @Body() body: BankingDetailsDto) {
      return this.usersService.setBankingDetails(id, body);
    }
  }
