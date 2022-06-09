import dedent from 'dedent-js';
import { StatefulSet } from 'kubernetes-models/apps/v1';
import { ConfigMap, Service } from 'kubernetes-models/v1';
import { DOMAIN_NAME, HTTP_AND_HTTPS_PORTS } from '../common/index';
import { CLOUDFLARED_IMAGE } from './cloudflare';
import { certificate } from './cloudflare';

const name = 'relay';
const namespace = 'cloudflare';
const metadata = { name, namespace };
const labels = { app: name };
const pvcName = `${name}-storage`;

const RELAY_PORT = 8000;
const METRICS_PORT = 5000;

export const generate = () => [
  new ConfigMap({
    metadata,
    data: {
      'nginx.conf': dedent(`
              server {
                  listen 80;
  
                  location /healthcheck {
                      return 200 "OK";
                  }
  
                  location / {
                      return 301 https://$host$request_uri;
                  }
              }
  
              server {
                  listen ${METRICS_PORT};
  
                  location /metrics {
                      proxy_pass http://127.0.0.1:${RELAY_PORT};
                  }
              }
  
              server {
                  listen 443 ssl;
  
                  ssl_certificate /etc/nginx/ssl/tls.crt;
                  ssl_certificate_key /etc/nginx/ssl/tls.key;
  
                  server_name ${name}.${namespace}.svc.${DOMAIN_NAME} *.${DOMAIN_NAME};
  
                  location / {
                      proxy_pass http://127.0.0.1:${RELAY_PORT}/;
                      proxy_http_version 1.1;
                      proxy_set_header Host $http_host;
                  }
              }
          
          `)
    }
  }),
  new Service({
    metadata,
    spec: {
      ports: HTTP_AND_HTTPS_PORTS,
      selector: labels
    }
  }),
  new StatefulSet({
    metadata,
    spec: {
      serviceName: name,
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
              name: 'relay',
              image: 'docker.coyle.club/internal/relay:1',
              ports: [
                {
                  containerPort: RELAY_PORT,
                  name: 'http'
                }
              ],
              volumeMounts: [
                {
                  name: pvcName,
                  mountPath: '/var/lib/relay'
                }
              ]
            },
            {
              name: 'cloudflared',
              image: CLOUDFLARED_IMAGE,
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
                      key: 'cloudflared-relay-token'
                    }
                  }
                }
              ]
            },
            {
              name: 'nginx',
              image: 'nginx',
              ports: [
                {
                  containerPort: 80
                },
                {
                  containerPort: 443
                },
                {
                  containerPort: METRICS_PORT,
                  name: 'metrics'
                }
              ],
              volumeMounts: [
                {
                  name,
                  mountPath: '/etc/nginx/conf.d'
                },
                {
                  name: 'ssl',
                  mountPath: '/etc/nginx/ssl'
                }
              ]
            }
          ],
          volumes: [
            {
              name,
              configMap: {
                name
              }
            },
            {
              name: 'ssl',
              secret: {
                secretName: certificate.spec.secretName
              }
            }
          ]
        }
      },
      volumeClaimTemplates: [
        {
          metadata: {
            name: pvcName
          },
          spec: {
            accessModes: ['ReadWriteOnce'],
            resources: {
              requests: {
                storage: '10Gi'
              }
            }
          }
        }
      ]
    }
  })
];
