import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from 'src/auth/entities/user.entity';
import { WeightUnit } from 'src/exercises/enums/weight-unit.enum';

export enum ActivityType {
  CATEGORY = 'category',
  EXERCISE = 'exercise',
  WEIGHT_HISTORY = 'weight_history',
}

export enum ActivityAction {
  CREATED = 'created',
  UPDATED = 'updated',
}

@Entity({ name: 'activity_log' })
@Index(['user', 'createdAt'])
export class ActivityLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'enum', enum: ActivityType })
  type!: ActivityType;

  @Column({ type: 'enum', enum: ActivityAction })
  action!: ActivityAction;

  // id del recurso que originó la actividad (no es FK: si el recurso
  // se borra después, la fila del feed sobrevive)
  @Column({ type: 'uuid' })
  entityId!: string;

  // snapshot del nombre al momento de la acción (para weight_history,
  // el nombre del ejercicio al que pertenece la entrada)
  @Column({ type: 'text' })
  description!: string;

  // solo para type = weight_history; null en el resto
  @Column({ type: 'integer', nullable: true })
  weightGrams!: number | null;

  @Column({ type: 'enum', enum: WeightUnit, nullable: true })
  weightUnit!: WeightUnit | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user!: User;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
