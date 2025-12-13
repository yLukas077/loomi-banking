import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
} from '@nestjs/common'
import { Response } from 'express'

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const req = ctx.getRequest()

    const status =
      exception instanceof HttpException ? exception.getStatus() : 500

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error'

    response.status(status).json({
      success: false,
      path: req.url,
      timestamp: new Date().toISOString(),
      error: message,
    })
  }
}
