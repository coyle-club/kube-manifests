import dedent from 'dedent-js';
import { ConfigMap, Namespace, Service } from 'kubernetes-models/v1';
import { wildcardCert } from './letsencrypt';
import { DOMAIN_NAME, HTTP_AND_HTTPS_PORTS } from '../common/index';
import { StatefulSet } from 'kubernetes-models/apps/v1';

const name = 'gitlab';
const namespace = 'default';
const metadata = { name, namespace };
const labels = { app: name };

const certificate = wildcardCert('coyle-wildcard', namespace, 'coyle-wildcard');

const pvcNameData = `${name}-data`;
const pvcNameConfig = `${name}-config`;
const pvcNameLogs = `${name}-logs`;
const DATA_MOUNT_PATH = '/var/opt/gitlab';
const CONFIG_MOUNT_PATH = '/etc/gitlab'
const LOGS_MOUNT_PATH = '/var/log/gitlab'

export const generate = () => [
  new Namespace({
    metadata: {
      name: namespace
    }
  }),
  certificate,
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
              name: 'gitlab',
              image: 'gitlab:15.5.9-ce.0',
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
                  name: pvcNameLogs,
                  mountPath: LOGS_MOUNT_PATH
                },
                {
                    name: pvcNameConfig,
                    mountPath: CONFIG_MOUNT_PATH
                },
                {
                    name: pvcNameData,
                    mountPath: DATA_MOUNT_PATH
                }
              ]
            }
          ],
          volumes: [
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
            name: pvcNameData
          },
          spec: {
            accessModes: ['ReadWriteOnce'],
            resources: {
              requests: {
                storage: '10Gi'
              }
            }
          }
        },
        {
            metadata: {
              name: pvcNameLogs
            },
            spec: {
              accessModes: ['ReadWriteOnce'],
              resources: {
                requests: {
                  storage: '10Gi'
                }
              }
            }
          },
          {
            metadata: {
              name: pvcNameConfig
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
