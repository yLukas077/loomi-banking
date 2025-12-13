import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common'
import { Observable, tap } from 'rxjs'

@Injectable()
export class LogInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest()

    const { method, url, requestId } = req
    const start = Date.now()

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - start

        console.log(
          JSON.stringify({
            requestId,
            method,
            url,
            duration,
            timestamp: new Date().toISOString(),
          }),
        )
      }),
    )
  }
}
