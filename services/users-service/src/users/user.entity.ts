import { Entity, PrimaryGeneratedColumn, Column, OneToOne } from 'typeorm'
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
  address: string

  @Column({ nullable: true })
  profilePicture: string

  @OneToOne(() => BankingDetails, (bd) => bd.user)
  bankingDetails: BankingDetails
}
