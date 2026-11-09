import { BadRequestException, PipeTransform } from "@nestjs/common";
import { z, type ZodType } from "zod";

export class ZodPipe<T extends ZodType> implements PipeTransform {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        code: "VALIDATION_FAILED",
        message: "Some fields are invalid",
        issues: result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    return result.data;
  }
}

/** Shorthand for @Body(V(schema)). */
export const V = <T extends ZodType>(schema: T) => new ZodPipe(schema);

export const zId = z.uuid();
export const zOptDate = z
  .union([z.iso.datetime({ offset: true }), z.iso.date(), z.null()])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === null ? null : new Date(v)));
export const zText = (max = 4000) => z.string().trim().max(max);
export const zOptText = (max = 4000) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "" ? null : v));
