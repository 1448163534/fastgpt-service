import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { request as httpsRequest } from 'https';
import { request as httpRequest } from 'http';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';

const baseUrl = process.env.AIPROXY_API_ENDPOINT;
const token = process.env.AIPROXY_API_TOKEN;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    console.log('=== API Proxy Request Start ===');
    console.log('Environment variables:', {
      AIPROXY_API_ENDPOINT: process.env.AIPROXY_API_ENDPOINT,
      AIPROXY_API_TOKEN: process.env.AIPROXY_API_TOKEN ? '***' : undefined
    });

    console.log('Request details:', {
      method: req.method,
      url: req.url,
      query: req.query,
      headers: req.headers
    });

    await authSystemAdmin({ req });

    if (!baseUrl || !token) {
      throw new Error('AIPROXY_API_ENDPOINT or AIPROXY_API_TOKEN is not set');
    }

    const { path = [], ...query } = req.query as any;

    if (!path.length) {
      throw new Error('url is empty');
    }

    // 移除 'api' 前缀，因为它是 Next.js 路由的一部分
    const apiPath = path[0] === 'api' ? path.slice(1) : path;
    const queryStr = new URLSearchParams(query).toString();
    
    // 确保路径以 /api 开头
    const requestPath = queryStr
      ? `/api/${apiPath.join('/')}?${queryStr}`
      : `/api/${apiPath.join('/')}`;

    console.log('Request path construction:', {
      originalPath: path,
      apiPath,
      query,
      queryStr,
      requestPath,
      fullUrl: `${baseUrl}${requestPath}`
    });

    const parsedUrl = new URL(baseUrl);
    console.log('Parsed URL:', {
      protocol: parsedUrl.protocol,
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      pathname: parsedUrl.pathname
    });

    delete req.headers?.cookie;
    delete req.headers?.host;
    delete req.headers?.origin;

    // Select request function based on protocol
    const requestFn = parsedUrl.protocol === 'https:' ? httpsRequest : httpRequest;

    return new Promise((resolve, reject) => {
      const requestOptions = {
        protocol: parsedUrl.protocol,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: requestPath,
        method: req.method,
        headers: {
          ...req.headers,
          Authorization: `Bearer ${token}`
        },
        timeout: 30000
      };

      console.log('Making request with options:', {
        ...requestOptions,
        headers: {
          ...requestOptions.headers,
          Authorization: 'Bearer ***'
        }
      });

      const requestResult = requestFn(requestOptions);

      requestResult.on('response', (response) => {
        console.log('Received response:', {
          statusCode: response.statusCode,
          headers: response.headers
        });

        Object.keys(response.headers).forEach((key) => {
          // @ts-ignore
          res.setHeader(key, response.headers[key]);
        });
        response.statusCode && res.writeHead(response.statusCode);
        
        let responseData = '';
        response.on('data', (chunk) => {
          responseData += chunk;
        });
        
        response.on('end', () => {
          console.log('Response completed:', {
            dataLength: responseData.length,
            data: responseData.substring(0, 100) + '...'
          });

          try {
            const data = JSON.parse(responseData);
            res.json(data);
            resolve(data);
          } catch (e) {
            console.error('Failed to parse response as JSON:', e);
            res.send(responseData);
            resolve(responseData);
          }
        });
      });

      requestResult.on('error', (e) => {
        console.error('Request error:', e);
        jsonRes(res, {
          code: 500,
          error: e.message
        });
        reject(e);
      });

      if (req.method !== 'GET') {
        req.pipe(requestResult);
      } else {
        requestResult.end();
      }
    });
  } catch (error) {
    console.error('Handler error:', error);
    jsonRes(res, {
      code: 500,
      error
    });
  } finally {
    console.log('=== API Proxy Request End ===');
  }
}

export const config = {
  api: {
    bodyParser: false
  }
};
