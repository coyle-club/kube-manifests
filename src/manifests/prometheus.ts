import dedent from 'dedent-js';
import { StatefulSet } from 'kubernetes-models/apps/v1';
import {
  ClusterRole,
  ClusterRoleBinding
} from 'kubernetes-models/rbac.authorization.k8s.io/v1';
import { ConfigMap, Service } from 'kubernetes-models/v1';
import {
  DOMAIN_NAME,
  HTTP_AND_HTTPS_CONTAINER_PORTS,
  HTTP_AND_HTTPS_PORTS
} from '../common/index';
import { certificate } from './monitoring';

const name = 'prometheus';
const namespace = 'monitoring';
const metadata = {
  name,
  namespace
};

const labels = { app: name };

const PROMETHEUS_PORT = 9090;

const sslPath = '/etc/nginx/ssl';
const promConfigPath = '/etc/prometheus/conf';
const promStoragePath = '/prometheus';

const pvcName = `${name}-storage`;

export const generate = () => [
  new ClusterRole({
    metadata: {
      name
    },
    rules: [
      {
        apiGroups: [''],
        resources: ['nodes', 'nodes/metrics', 'services', 'endpoints', 'pods'],
        verbs: ['get', 'list', 'watch']
      },
      {
        apiGroups: [''],
        resources: ['configmaps'],
        verbs: ['get']
      },
      {
        nonResourceURLs: ['/metrics'],
        verbs: ['get']
      }
    ]
  }),
  new ClusterRoleBinding({
    metadata: {
      name
    },
    roleRef: {
      apiGroup: 'rbac.authorization.k8s.io',
      kind: 'ClusterRole',
      name
    },
    subjects: [
      {
        kind: 'ServiceAccount',
        name: 'default',
        namespace
      }
    ]
  }),
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
                  listen 443 ssl;
  
                  ssl_certificate ${sslPath}/tls.crt;
                  ssl_certificate_key ${sslPath}/tls.key;
  
                  server_name ${name}.${namespace}.svc.${DOMAIN_NAME} *.${DOMAIN_NAME};
  
                  location / {
                      proxy_pass http://127.0.0.1:${PROMETHEUS_PORT}/;
                      proxy_http_version 1.1;
                      proxy_set_header Host $http_host;
                  }
              }
          `),
      'prometheus.yml': JSON.stringify({
        global: {
          scrape_interval: '15s',
          evaluation_interval: '15s'
        },
        rule_files: [],
        scrape_configs: [
          {
            job_name: 'prometheus',
            static_configs: [
              {
                targets: [`localhost:${PROMETHEUS_PORT}`]
              }
            ]
          },
          {
            job_name: 'kube-apiservers',
            kubernetes_sd_configs: [{ role: 'endpoints' }],
            scheme: 'https',
            tls_config: {
              ca_file: '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt'
            },
            bearer_token_file:
              '/var/run/secrets/kubernetes.io/serviceaccount/token',
            relabel_configs: [
              {
                source_labels: [
                  '__meta_kubernetes_namespace',
                  '__meta_kubernetes_service_name',
                  '__meta_kubernetes_endpoint_port_name'
                ],
                action: 'keep',
                regex: 'default;kubernetes;https'
              }
            ]
          },
          {
            job_name: 'kube-nodes',
            kubernetes_sd_configs: [{ role: 'node' }],
            scheme: 'https',
            tls_config: {
              ca_file: '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt'
            },
            bearer_token_file:
              '/var/run/secrets/kubernetes.io/serviceaccount/token',
            relabel_configs: [
              {
                action: 'labelmap',
                regex: '__meta_kubernetes_node_label_(.+)'
              },
              {
                target_label: '__address__',
                replacement: 'kubernetes.default.svc:443'
              },
              {
                source_labels: ['__meta_kubernetes_node_name'],
                regex: '(.+)',
                target_label: '__metrics_path__',
                replacement: '/api/v1/nodes/${1}/proxy/metrics'
              }
            ]
          },
          {
            job_name: 'kube-pods',
            kubernetes_sd_configs: [{ role: 'pod' }],
            relabel_configs: [
              {
                source_labels: ['__meta_kubernetes_pod_container_port_name'],
                action: 'keep',
                regex: 'metrics'
              },
              {
                action: 'replace',
                regex: '(.+)',
                source_labels: [
                  '__meta_kubernetes_pod_annotation_prometheus_io_path'
                ],
                target_label: '__metrics_path__'
              },
              {
                action: 'replace',
                regex: '([^:]+)(?::\\d+)?;(\\d+)',
                replacement: '$1:$2',
                source_labels: [
                  '__address__',
                  '__meta_kubernetes_pod_annotation_prometheus_io_port'
                ],
                target_label: '__address__'
              },
              {
                action: 'labelmap',
                regex: '__meta_kubernetes_pod_label_(.+)'
              },
              {
                action: 'replace',
                source_labels: ['__meta_kubernetes_namespace'],
                target_label: 'namespace'
              },
              {
                action: 'replace',
                source_labels: ['__meta_kubernetes_pod_name'],
                target_label: 'pod'
              }
            ]
          }
        ]
      })
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
              name: 'prometheus',
              image: 'prom/prometheus:v2.35.0',
              args: [
                `--web.listen-address=127.0.0.1:${PROMETHEUS_PORT}`,
                `--config.file=${promConfigPath}/prometheus.yml`,
                `--storage.tsdb.path=${promStoragePath}`,
                '--storage.tsdb.retention.time=730d',
                '--storage.tsdb.retention.size=10GB',
                '--web.console.libraries=/usr/share/prometheus/console_libraries',
                '--web.console.templates=/usr/share/prometheus/consoles'
              ],
              ports: [
                {
                  name: 'prom',
                  containerPort: PROMETHEUS_PORT
                }
              ],
              volumeMounts: [
                {
                  name: pvcName,
                  mountPath: promStoragePath
                },
                {
                  name: 'prometheus-conf',
                  mountPath: promConfigPath
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
              name: 'prometheus-conf',
              configMap: {
                name,
                items: [
                  {
                    key: 'prometheus.yml',
                    path: 'prometheus.yml'
                  }
                ]
              }
            },
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
