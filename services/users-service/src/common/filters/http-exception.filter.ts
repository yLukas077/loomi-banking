import {
  Catch,
  ExceptionFilter,
  ArgumentsHost,
  HttpException,
  Logger,
} from '@nestjs/common'

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name)

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse()
    const request = ctx.getRequest()

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : 500

    const rawResponse =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error'

    let errorMessage: string

    if (typeof rawResponse === 'string') {
      errorMessage = rawResponse
    } else if (
      typeof rawResponse === 'object' &&
      rawResponse !== null &&
      'message' in rawResponse
    ) {
      const extracted = (rawResponse as any).message
      errorMessage = Array.isArray(extracted) ? extracted.join(', ') : extracted
    } else {
      errorMessage = 'Unexpected error'
    }

    const errorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message: errorMessage,
      requestId: request.requestId,
    }

    this.logger.error(
      `Error ${status} - ${request.method} ${request.url} requestId=${request.requestId}`,
      JSON.stringify(errorResponse),
    )

    response.status(status).json(errorResponse)
  }
}
