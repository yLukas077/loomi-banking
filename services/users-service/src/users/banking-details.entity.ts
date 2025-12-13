import { Entity, PrimaryGeneratedColumn, Column, JoinColumn, OneToOne } from 'typeorm'
import { User } from './user.entity'

@Entity()
export class BankingDetails {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column()
  agency: string

  @Column()
  accountNumber: string

  @OneToOne(() => User)
  @JoinColumn()
  user: User
}
