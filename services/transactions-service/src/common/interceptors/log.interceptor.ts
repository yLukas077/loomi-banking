import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common'
import { Observable, tap } from 'rxjs'

@Injectable()
export class LogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LogInterceptor.name)

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest()

    const { method, url } = req
    const requestId = req.requestId

    this.logger.log(
      `REQUEST ${method} ${url} requestId=${requestId}`,
    )

    const now = Date.now()

    return next.handle().pipe(
      tap((responseBody) => {
        const duration = Date.now() - now
        this.logger.log(
          `RESPONSE ${method} ${url} requestId=${requestId} duration=${duration}ms`
        )
      }),
    )
  }
}
