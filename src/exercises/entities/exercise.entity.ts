import { Category } from 'src/categories/entities/category.entity';
import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

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

  @ManyToOne(() => Category, (category) => category.exercise)
  category: Category;

  //   lastUpdateDate: string;
}
