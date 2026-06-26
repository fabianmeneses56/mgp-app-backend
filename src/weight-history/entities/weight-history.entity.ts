import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { WeightUnit } from 'src/exercises/enums/weight-unit.enum';
import { Exercise } from 'src/exercises/entities/exercise.entity';

@Entity({ name: 'weight_history' })
export class WeightHistory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'integer' })
  weightGrams!: number;

  @Column({ type: 'enum', enum: WeightUnit, default: WeightUnit.KILOGRAM })
  weightUnit!: WeightUnit;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  @Column({ type: 'timestamptz' })
  date!: Date;

  @ManyToOne(() => Exercise, (exercise) => exercise.weightHistory, {
    onDelete: 'CASCADE',
  })
  exercise!: Exercise;
}
