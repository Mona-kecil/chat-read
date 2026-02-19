export class RequestValidationError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "RequestValidationError";
    this.status = status;
  }
}
