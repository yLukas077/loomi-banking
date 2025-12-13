import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
} from 'typeorm'
import { User } from './user.entity'

@Entity()
export class BankingDetails {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column()
  agency: string

  @Column()
  accountNumber: string

  @Column({ default: 'checking' }) // 'checking' | 'savings'
  accountType: string

  @OneToOne(() => User, (user) => user.bankingDetails, {
    onDelete: 'CASCADE',
  })
  @JoinColumn()
  user: User

  @Column()
  userId: string
}
