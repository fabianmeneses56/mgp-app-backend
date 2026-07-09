import { MigrationInterface, QueryRunner } from "typeorm";

export class Initial1783522657671 implements MigrationInterface {
    name = 'Initial1783522657671'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" text NOT NULL, "password" text NOT NULL, "fullName" text NOT NULL, "isActive" boolean NOT NULL DEFAULT true, "roles" text array NOT NULL DEFAULT '{user}', CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "categories" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" text NOT NULL, "userId" uuid, CONSTRAINT "PK_24dbc6126a28ff948da33e97d3b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."exercises_weightunit_enum" AS ENUM('g', 'kg', 'lb')`);
        await queryRunner.query(`CREATE TABLE "exercises" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" text NOT NULL, "weightGrams" integer NOT NULL, "weightUnit" "public"."exercises_weightunit_enum" NOT NULL DEFAULT 'g', "imageUrl" text, "categoryId" uuid, CONSTRAINT "PK_c4c46f5fa89a58ba7c2d894e3c3" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."weight_history_weightunit_enum" AS ENUM('g', 'kg', 'lb')`);
        await queryRunner.query(`CREATE TABLE "weight_history" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "weightGrams" integer NOT NULL, "weightUnit" "public"."weight_history_weightunit_enum" NOT NULL DEFAULT 'kg', "note" text, "date" TIMESTAMP WITH TIME ZONE NOT NULL, "exerciseId" uuid, CONSTRAINT "PK_a5697ac8bfdda68bc5e37d25297" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "categories" ADD CONSTRAINT "FK_13e8b2a21988bec6fdcbb1fa741" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "exercises" ADD CONSTRAINT "FK_5aff9654a2114b32f906116daaf" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "weight_history" ADD CONSTRAINT "FK_de853040cff8ce123d850901aab" FOREIGN KEY ("exerciseId") REFERENCES "exercises"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "weight_history" DROP CONSTRAINT "FK_de853040cff8ce123d850901aab"`);
        await queryRunner.query(`ALTER TABLE "exercises" DROP CONSTRAINT "FK_5aff9654a2114b32f906116daaf"`);
        await queryRunner.query(`ALTER TABLE "categories" DROP CONSTRAINT "FK_13e8b2a21988bec6fdcbb1fa741"`);
        await queryRunner.query(`DROP TABLE "weight_history"`);
        await queryRunner.query(`DROP TYPE "public"."weight_history_weightunit_enum"`);
        await queryRunner.query(`DROP TABLE "exercises"`);
        await queryRunner.query(`DROP TYPE "public"."exercises_weightunit_enum"`);
        await queryRunner.query(`DROP TABLE "categories"`);
        await queryRunner.query(`DROP TABLE "users"`);
    }

}
