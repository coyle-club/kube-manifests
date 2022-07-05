import { ConfigMap, Service, ServiceAccount } from 'kubernetes-models/v1';
import {
  ClusterRole,
  ClusterRoleBinding
} from 'kubernetes-models/rbac.authorization.k8s.io/v1';
import dedent from 'dedent-js';
import { Deployment } from 'kubernetes-models/apps/v1';
import { DNS_IP, DOMAIN_NAME } from '../common';

const name = 'coredns';
const namespace = 'kube-system';
const labels = {
  'k8s-app': 'kube-dns'
};
const metadata = {
  name,
  namespace
};

const DNS_PORT = 53;
const METRICS_PORT = 9153;

export const generate = () => [
  new ServiceAccount({
    metadata
  }),
  new ClusterRole({
    metadata: {
      name: 'system:coredns',
      labels: {
        'kubernetes.io/bootstrapping': 'rbac-defaults'
      }
    },
    rules: [
      {
        apiGroups: [''],
        resources: ['endpoints', 'services', 'pods', 'namespaces'],
        verbs: ['list', 'watch']
      },
      {
        apiGroups: ['discovery.k8s.io'],
        resources: ['endpointslices'],
        verbs: ['list', 'watch']
      }
    ]
  }),
  new ClusterRoleBinding({
    metadata: {
      name: 'system:coredns',
      labels: {
        'kubernetes.io/bootstrapping': 'rbac-defaults'
      },
      annotations: {
        'rbac.authorization.kubernetes.io/autoupdate': 'true'
      }
    },
    roleRef: {
      apiGroup: 'rbac.authorization.k8s.io',
      kind: 'ClusterRole',
      name: 'system:coredns'
    },
    subjects: [
      {
        kind: 'ServiceAccount',
        name: 'coredns',
        namespace
      }
    ]
  }),
  new ConfigMap({
    metadata,
    data: {
      Corefile: dedent(`
              .:${DNS_PORT} {
                  errors
                  health
                  ready
                  rewrite name grafana.coyle.club grafana.monitoring.svc.coyle.club
                  rewrite name docker.coyle.club registry.docker.svc.coyle.club
                  rewrite name relay.coyle.club relay.cloudflare.svc.coyle.club
                  rewrite name nitter.coyle.club nitter.default.svc.coyle.club
                  kubernetes ${DOMAIN_NAME} in-addr.arpa ip6.arpa {
                      pods insecure
                  }
                  hosts /etc/coredns/NodeHosts {
                      ttl 60
                      reload 15s
                      fallthrough
                  }
                  prometheus :${METRICS_PORT}
                  auto {
                      directory /etc/coredns/zones
                  }
                  forward . /etc/resolv.conf
                  cache 30
                  loop
                  reload
                  loadbalance
              }
          `)
    }
  }),
  new Deployment({
    metadata: {
      labels: {
        'kubernetes.io/name': 'CoreDNS',
        ...labels
      },
      ...metadata
    },
    spec: {
      replicas: 1,
      strategy: {
        type: 'RollingUpdate',
        rollingUpdate: {
          maxUnavailable: 1
        }
      },
      selector: {
        matchLabels: labels
      },
      template: {
        metadata: {
          labels
        },
        spec: {
          priorityClassName: 'system-cluster-critical',
          serviceAccountName: name,
          tolerations: [
            {
              key: 'CriticalAddonsOnly',
              operator: 'Exists'
            },
            {
              key: 'node-role.kubernetes.io/control-plane',
              operator: 'Exists',
              effect: 'NoSchedule'
            },
            {
              key: 'node-role.kubernetes.io/master',
              operator: 'Exists',
              effect: 'NoSchedule'
            }
          ],
          nodeSelector: {
            'kubernetes.io/os': 'linux'
          },
          topologySpreadConstraints: [
            {
              maxSkew: 1,
              topologyKey: 'kubernetes.io/hostname',
              whenUnsatisfiable: 'DoNotSchedule',
              labelSelector: {
                matchLabels: labels
              }
            }
          ],
          containers: [
            {
              name: 'coredns',
              image: 'rancher/mirrored-coredns-coredns:1.9.1',
              resources: {
                limits: {
                  memory: '170Mi'
                },
                requests: {
                  cpu: '100m',
                  memory: '70Mi'
                }
              },
              args: ['-conf', '/etc/coredns/Corefile'],
              volumeMounts: [
                {
                  name: 'config-volume',
                  mountPath: '/etc/coredns',
                  readOnly: true
                }
              ],
              ports: [
                {
                  containerPort: DNS_PORT,
                  name: 'dns',
                  protocol: 'UDP'
                },
                {
                  containerPort: DNS_PORT,
                  name: 'dns-tcp',
                  protocol: 'TCP'
                },
                {
                  containerPort: METRICS_PORT,
                  name: 'metrics',
                  protocol: 'TCP'
                }
              ],
              securityContext: {
                allowPrivilegeEscalation: false,
                capabilities: {
                  add: ['NET_BIND_SERVICE'],
                  drop: ['all']
                },
                readOnlyRootFilesystem: true
              },
              livenessProbe: {
                httpGet: {
                  path: '/health',
                  port: 8080,
                  scheme: 'HTTP'
                },
                initialDelaySeconds: 60,
                periodSeconds: 10,
                timeoutSeconds: 1,
                successThreshold: 1,
                failureThreshold: 3
              },
              readinessProbe: {
                httpGet: {
                  path: '/ready',
                  port: 8181,
                  scheme: 'HTTP'
                },
                initialDelaySeconds: 0,
                periodSeconds: 2,
                timeoutSeconds: 1,
                successThreshold: 1,
                failureThreshold: 3
              }
            }
          ],
          dnsPolicy: 'Default',
          volumes: [
            {
              name: 'config-volume',
              configMap: {
                name,
                items: [
                  {
                    key: 'Corefile',
                    path: 'Corefile'
                  },
                  {
                    key: 'NodeHosts',
                    path: 'NodeHosts'
                  }
                ]
              }
            }
          ]
        }
      }
    }
  }),
  new Service({
    metadata: {
      labels: {
        'kubernetes.io/cluster-service': 'true',
        'kubernetes.io/name': 'CoreDNS',
        ...labels
      },
      ...metadata,
      name: 'kube-dns'
    },
    spec: {
      selector: labels,
      clusterIP: DNS_IP,
      ports: [
        {
          name: 'dns',
          port: DNS_PORT,
          protocol: 'UDP'
        },
        {
          name: 'dns-tcp',
          port: DNS_PORT,
          protocol: 'TCP'
        },
        {
          name: 'metrics',
          port: METRICS_PORT,
          protocol: 'TCP'
        }
      ]
    }
  })
];
