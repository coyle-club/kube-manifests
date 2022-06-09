import dedent from 'dedent-js';
import { ConfigMap, Namespace, Service } from 'kubernetes-models/v1';
import { wildcardCert } from './letsencrypt';
import { DOMAIN_NAME, HTTP_AND_HTTPS_PORTS } from '../common/index';
import { StatefulSet } from 'kubernetes-models/apps/v1';

const name = 'registry';
const namespace = 'docker';
const metadata = { name, namespace };
const labels = { app: name };

const certificate = wildcardCert('coyle-wildcard', namespace, 'coyle-wildcard');

const REGISTRY_PORT = 5000;
const METRICS_PORT = 5001;

const pvcName = `${name}-storage`;
const STORAGE_MOUNT_PATH = '/var/lib/registry';

export const generate = () => [
  new Namespace({
    metadata: {
      name: namespace
    }
  }),
  certificate,
  new ConfigMap({
    metadata,
    data: {
      'config.yml': JSON.stringify({
        version: '0.1',
        log: {
          fields: {
            service: 'registry'
          }
        },
        storage: {
          cache: {
            blobdescriptor: 'inmemory'
          },
          filesystem: {
            rootdirectory: STORAGE_MOUNT_PATH
          }
        },
        http: {
          addr: `:${REGISTRY_PORT}`,
          debug: {
            addr: `:${METRICS_PORT}`,
            prometheus: {
              enabled: true
            }
          },
          headers: {
            'X-Content-Type-Options': ['nosniff']
          }
        },
        health: {
          storagedriver: {
            enabled: true,
            interval: '10s',
            threshold: 3
          }
        }
      }),
      'nginx.conf': dedent(`
              map $upstream_http_docker_distribution_api_version $docker_distribution_api_version {
              '' 'registry/2.0';
              }
          
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
                  listen 443 ssl;
          
                  ssl_certificate /etc/nginx/ssl/tls.crt;
                  ssl_certificate_key /etc/nginx/ssl/tls.key;
          
                  server_name ${name}.${namespace}.svc.${DOMAIN_NAME} *.${DOMAIN_NAME};
          
                  client_max_body_size 0;
          
                  chunked_transfer_encoding on;
          
                  location /healthcheck {
                      return 200 "OK";
                  }
          
                  location /v2/ {
                      add_header 'Docker-Distribution-Api-Version' $docker_distribution_api_version always;
              
                      proxy_pass                          http://127.0.0.1:${REGISTRY_PORT};
                      proxy_set_header  Host              $http_host;
                      proxy_set_header  X-Real-IP         $remote_addr;
                      proxy_set_header  X-Forwarded-For   $proxy_add_x_forwarded_for;
                      proxy_set_header  X-Forwarded-Proto $scheme;
                      proxy_read_timeout                  900;
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
              name: 'registry',
              image: 'registry:2.8.1',
              ports: [
                {
                  name: 'registry',
                  containerPort: REGISTRY_PORT
                },
                {
                  name: 'metrics',
                  containerPort: METRICS_PORT
                }
              ],
              volumeMounts: [
                {
                  name: pvcName,
                  mountPath: STORAGE_MOUNT_PATH
                },
                {
                  name: 'registry-conf',
                  mountPath: '/etc/docker/registry'
                }
              ]
            },
            {
              name: 'nginx',
              image: 'nginx',
              ports: [
                {
                  name: 'http',
                  containerPort: 80
                },
                {
                  name: 'https',
                  containerPort: 443
                }
              ],
              volumeMounts: [
                {
                  name: 'nginx-conf',
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
              name: 'nginx-conf',
              configMap: {
                name,
                items: [
                  {
                    key: 'nginx.conf',
                    path: 'nginx.conf'
                  }
                ]
              }
            },
            {
              name: 'registry-conf',
              configMap: {
                name,
                items: [
                  {
                    key: 'config.yml',
                    path: 'config.yml'
                  }
                ]
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
