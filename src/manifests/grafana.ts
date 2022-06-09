import dedent from 'dedent-js';
import { StatefulSet } from 'kubernetes-models/apps/v1';
import { ConfigMap, Service } from 'kubernetes-models/v1';
import { certificate } from './monitoring';
import {
  DOMAIN_NAME,
  HTTP_AND_HTTPS_CONTAINER_PORTS,
  HTTP_AND_HTTPS_PORTS
} from '../common/index';

const namespace = 'monitoring';
const name = 'grafana';
const metadata = {
  name,
  namespace
};

const labels = { app: name };
const pvcName = `${name}-storage`;

const GRAFANA_PORT = 3000;
const CF_EMAIL_HEADER = 'Cf-Access-Authenticated-User-Email';
const sslPath = '/etc/nginx/ssl';

export const generate = () => [
  new ConfigMap({
    metadata,
    data: {
      'nginx.conf': dedent(`
        server {
            listen 80;
            server_name *.${DOMAIN_NAME};

            location /healthcheck {
            return 200 "OK";
            }

            location / {
            return 301 https://$host$request_uri;
            }
        }

        server {
            listen 443 ssl;

            ssl_certificate ${sslPath}/tls.crt;
            ssl_certificate_key ${sslPath}/tls.key;

            server_name *.${DOMAIN_NAME};

            location / {
                proxy_pass http://127.0.0.1:${GRAFANA_PORT}/;
                proxy_http_version 1.1;
                proxy_set_header Host $http_host;
                proxy_pass_header ${CF_EMAIL_HEADER};
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
              name: 'grafana',
              image: 'grafana/grafana-oss:8.5.2',
              env: [
                {
                  name: 'GF_AUTH_PROXY_ENABLED',
                  value: 'true'
                },
                {
                  name: 'GF_AUTH_PROXY_HEADER_NAME',
                  value: CF_EMAIL_HEADER
                }
              ],
              ports: [
                {
                  name: 'graf',
                  containerPort: GRAFANA_PORT
                }
              ],
              volumeMounts: [
                {
                  name: pvcName,
                  mountPath: '/var/lib/grafana'
                }
              ]
            },
            {
              name: 'nginx',
              image: 'nginx',
              ports: HTTP_AND_HTTPS_CONTAINER_PORTS,
              volumeMounts: [
                {
                  name: 'nginx-conf',
                  mountPath: '/etc/nginx/conf.d'
                },
                {
                  name: 'ssl',
                  mountPath: sslPath
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
                storage: '1Gi'
              }
            }
          }
        }
      ]
    }
  })
];
