import { Controller, All, Req, Res } from '@nestjs/common';
import { createProxyMiddleware } from 'http-proxy-middleware';

@Controller()
export class GatewayController {
  private usersProxy = createProxyMiddleware({
    target: process.env.USERS_SERVICE_URL,
    changeOrigin: true,
  });

  private transactionsProxy = createProxyMiddleware({
    target: process.env.TRANSACTIONS_SERVICE_URL,
    changeOrigin: true,
  });

  @All('/users')
  @All('/users/*')
  handleUsers(@Req() req, @Res() res) {
    this.usersProxy(req, res, (err) => console.error(err));
  }

  @All('/transactions')
  @All('/transactions/*')
  handleTransactions(@Req() req, @Res() res) {
    this.transactionsProxy(req, res, (err) => console.error(err));
  }
}