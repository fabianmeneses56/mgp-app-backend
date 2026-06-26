import { Category } from 'src/categories/entities/category.entity';
import { WeightHistory } from 'src/weight-history/entities/weight-history.entity';
import {
  Column,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { WeightUnit } from 'src/exercises/enums/weight-unit.enum';

@Entity({ name: 'exercises' })
export class Exercise {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  name: string;

  @Column({
    type: 'integer',
  })
  weightGrams: number;

  @Column({
    type: 'enum',
    enum: WeightUnit,
    default: WeightUnit.GRAM,
  })
  weightUnit: WeightUnit;

  @Column('text', {
    nullable: true,
  })
  imageUrl?: string | null;

  @ManyToOne(() => Category, (category) => category.exercise)
  category: Category;

  @OneToMany(() => WeightHistory, (wh) => wh.exercise)
  weightHistory: WeightHistory[];
}
