import { Category } from 'src/categories/entities/category.entity';
import {
  BeforeInsert,
  BeforeUpdate,
  Column,
  Entity,
  OneToMany,
  // OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
// import { Product } from '../../products/entities';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('text', {
    unique: true,
  })
  email!: string;

  @Column('text', {
    select: false, // cuando usamos find ya no aparece en la data que retorna
  })
  password?: string;

  @Column('text')
  fullName!: string;

  @Column('bool', {
    default: true,
  })
  isActive!: boolean;

  @Column('text', {
    array: true,
    default: ['user'],
  })
  roles!: string[];

  @OneToMany(() => Category, (category) => category.user)
  category!: Category;

  @BeforeInsert()
  checkFieldsBeforeInsert() {
    this.email = this.email.toLowerCase().trim();
  }

  @BeforeUpdate()
  checkFieldsBeforeUpdate() {
    this.checkFieldsBeforeInsert();
  }
}
