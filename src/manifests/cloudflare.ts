import { Namespace, ConfigMap } from 'kubernetes-models/v1';
import { Deployment } from 'kubernetes-models/apps/v1';

import { DNS_IP, DOMAIN_NAME } from '../common/index';
import dedent from 'dedent-js';
import { wildcardCert } from './letsencrypt';

const name = 'tunnel';
const namespace = 'cloudflare';
const metadata = { name, namespace };
const labels = { app: name };

const NGINX_PORT = 8000;

export const CLOUDFLARED_IMAGE = 'cloudflare/cloudflared:2022.5.3';

export const certificate = wildcardCert(
  'coyle-wildcard',
  namespace,
  'coyle-wildcard'
);

export const generate = () => [
  new Namespace({
    metadata: {
      name: namespace
    }
  }),
  new ConfigMap({
    metadata,
    data: {
      'nginx.conf': dedent(`
        server {
          listen 127.0.0.1:${NGINX_PORT};
          server_name *.${DOMAIN_NAME};
          location / {
            resolver ${DNS_IP};
            proxy_pass https://$host$request_uri;
            proxy_http_version 1.1;
          }
      }`)
    }
  }),
  new Deployment({
    metadata,
    spec: {
      replicas: 1,
      selector: {
        matchLabels: labels
      },
      template: {
        metadata: {
          labels
        },
        spec: {
          containers: [
            {
              name: 'nginx',
              image: 'nginx',
              ports: [
                {
                  containerPort: NGINX_PORT
                }
              ],
              volumeMounts: [
                {
                  name: 'nginx-conf',
                  mountPath: '/etc/nginx/conf.d'
                }
              ]
            },
            {
              name: 'cloudflared',
              image: 'cloudflare/cloudflared:2022.5.3',
              args: [
                'tunnel',
                '--no-autoupdate',
                'run',
                '--token',
                '$(CLOUDFLARED_TOKEN)'
              ],
              env: [
                {
                  name: 'CLOUDFLARED_TOKEN',
                  valueFrom: {
                    secretKeyRef: {
                      name: 'cloudflared',
                      key: 'cloudflared-tunnel-token'
                    }
                  }
                }
              ]
            }
          ],
          volumes: [
            {
              name: 'nginx-conf',
              configMap: {
                name
              }
            }
          ]
        }
      }
    }
  })
];
