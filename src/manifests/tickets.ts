import { StatefulSet } from 'kubernetes-models/apps/v1';
import { Service } from 'kubernetes-models/v1';
import { certificate } from './default';

const name = 'tickets';
const namespace = 'default';
const metadata = { name, namespace };
const labels = { app: name };

export const generate = () => [
  new Service({
    metadata,
    spec: {
      ports: [
        {
          name: 'https',
          port: 443
        }
      ],
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
              name: 'tickets',
              image: 'docker.coyle.club/internal/tickets:3',
              args: [
                '--access-logfile',
                '-',
                '--certfile',
                '/etc/ssl/coyle.club/tls.crt',
                '--keyfile',
                '/etc/ssl/coyle.club/tls.key',
                '--bind',
                ':443'
              ],
              ports: [
                {
                  name: 'https',
                  containerPort: 443
                }
              ],
              volumeMounts: [
                {
                  name,
                  mountPath: '/var/lib/tickets'
                },
                {
                  name: 'ssl',
                  mountPath: '/etc/ssl/coyle.club'
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
            name
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
