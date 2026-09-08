import type { RequestHandler } from "express";
import type { ZodTypeAny } from "zod";

export const validate = (
  schema: ZodTypeAny,
  target: "body" | "query" | "params" = "body",
): RequestHandler => {
  return async (req, _res, next) => {
    try {
      const parsed = await schema.parseAsync(req[target]);
      Object.defineProperty(req, target, {
        value: parsed,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      next();
    } catch (error) {
      next(error);
    }
  };
};
