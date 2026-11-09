import {
  ArgumentsHost,
  Catch,
  ConflictException,
  ExceptionFilter,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { InvalidTransitionError } from "@workmesh/core";
import type { Request, Response } from "express";

/**
 * Resources the viewer may not see are reported as 404 — identical to a missing record —
 * so IDs cannot be used to probe for the existence of confidential data.
 */
export const notFound = (what = "Resource") => new NotFoundException({ code: "NOT_FOUND", message: `${what} not found` });
export const forbidden = (reason: string) => new ForbiddenException({ code: "FORBIDDEN", message: reason });
export const conflict = (message = "This record was changed by someone else. Reload and try again.") =>
  new ConflictException({ code: "VERSION_CONFLICT", message });
export const invalid = (code: string, message: string) => new UnprocessableEntityException({ code, message });

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger("Errors");

  catch(exception: unknown, host: ArgumentsHost) {
    if (host.getType() !== "http") throw exception;
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { id?: string }>();
    const requestId = (req.headers["x-request-id"] as string) ?? req.id;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: Record<string, unknown> = { code: "INTERNAL", message: "Something went wrong on our side." };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const r = exception.getResponse();
      body = typeof r === "string" ? { code: codeFor(status), message: r } : { code: codeFor(status), ...(r as object) };
      if ("statusCode" in body) delete body.statusCode;
      if ("error" in body) delete body.error;
    } else if (exception instanceof InvalidTransitionError) {
      status = HttpStatus.UNPROCESSABLE_ENTITY;
      body = { code: "INVALID_TRANSITION", message: exception.message, from: exception.from, to: exception.to };
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === "P2002") {
        status = HttpStatus.CONFLICT;
        body = { code: "DUPLICATE", message: "A record with these values already exists." };
      } else if (exception.code === "P2025") {
        status = HttpStatus.NOT_FOUND;
        body = { code: "NOT_FOUND", message: "Resource not found" };
      } else if (exception.code === "P2003") {
        status = HttpStatus.UNPROCESSABLE_ENTITY;
        body = { code: "INVALID_REFERENCE", message: "A referenced record does not exist." };
      }
    }

    if (status >= 500) {
      // Never log request bodies: they may contain employee-written notes.
      this.logger.error(
        { requestId, path: req.path, method: req.method, err: exception instanceof Error ? exception.stack : String(exception) },
        "Unhandled error",
      );
    }
    res.status(status).json({ ...body, requestId });
  }
}

function codeFor(status: number) {
  switch (status) {
    case 400:
      return "BAD_REQUEST";
    case 401:
      return "UNAUTHENTICATED";
    case 403:
      return "FORBIDDEN";
    case 404:
      return "NOT_FOUND";
    case 409:
      return "CONFLICT";
    case 422:
      return "UNPROCESSABLE";
    case 429:
      return "RATE_LIMITED";
    default:
      return "ERROR";
  }
}
