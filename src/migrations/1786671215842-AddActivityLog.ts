import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddActivityLog1786671215842 implements MigrationInterface {
  name = 'AddActivityLog1786671215842';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."activity_log_type_enum" AS ENUM('category', 'exercise', 'weight_history')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."activity_log_action_enum" AS ENUM('created', 'updated')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."activity_log_weightunit_enum" AS ENUM('g', 'kg', 'lb')`,
    );
    await queryRunner.query(
      `CREATE TABLE "activity_log" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "type" "public"."activity_log_type_enum" NOT NULL, "action" "public"."activity_log_action_enum" NOT NULL, "entityId" uuid NOT NULL, "description" text NOT NULL, "weightGrams" integer, "weightUnit" "public"."activity_log_weightunit_enum", "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "userId" uuid, CONSTRAINT "PK_067d761e2956b77b14e534fd6f1" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d556d97a2bef84be58cb7f3123" ON "activity_log" ("userId", "createdAt") `,
    );
    await queryRunner.query(
      `ALTER TABLE "activity_log" ADD CONSTRAINT "FK_d19abacc8a508c0429478ad166b" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "activity_log" DROP CONSTRAINT "FK_d19abacc8a508c0429478ad166b"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_d556d97a2bef84be58cb7f3123"`,
    );
    await queryRunner.query(`DROP TABLE "activity_log"`);
    await queryRunner.query(
      `DROP TYPE "public"."activity_log_weightunit_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."activity_log_action_enum"`);
    await queryRunner.query(`DROP TYPE "public"."activity_log_type_enum"`);
  }
}
