import { User } from 'src/auth/entities/user.entity';
import { Exercise } from 'src/exercises/entities/exercise.entity';
import {
  Column,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'categories' })
export class Category {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  name: string;

  @ManyToOne(() => User, (user) => user.category, { eager: false })
  user: User;

  @OneToMany(() => Exercise, (exercise) => exercise.category, { eager: true })
  exercise: Exercise;
}
