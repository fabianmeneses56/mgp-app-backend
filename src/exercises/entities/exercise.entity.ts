import { Category } from 'src/categories/entities/category.entity';
import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

export enum WeightUnit {
  GRAM = 'g',
  KILOGRAM = 'kg',
  POUND = 'lb',
}

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

  //   lastUpdateDate: string;
}
