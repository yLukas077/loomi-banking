import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
} from 'typeorm'

import { BankingDetails } from './banking-details.entity'


@Entity()
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column()
  name: string

  @Column({ unique: true })
  email: string

  @Column({ nullable: true })
  address?: string

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date

  @OneToOne(() => BankingDetails, (details) => details.user)
  bankingDetails: BankingDetails

}
