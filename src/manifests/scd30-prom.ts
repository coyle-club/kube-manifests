import { Deployment } from 'kubernetes-models/apps/v1';
import { ConfigMap, Service } from 'kubernetes-models/v1';

const name = 'scd30-prom';
const namespace = 'monitoring';
const metadata = { name, namespace };
const labels = { app: name };

const METRICS_PORT = 8080;

export const generate = () => [
  new Service({
    metadata,
    spec: {
      ports: [
        {
          name: 'metrics',
          port: METRICS_PORT
        }
      ],
      selector: labels
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
          nodeSelector: {
            'kubernetes.io/hostname': 'mycomaster'
          },
          containers: [
            {
              name: 'scd30-prom',
              image: 'docker.coyle.club/internal/scd30_prom:1',
              args: [
                '--port',
                String(METRICS_PORT)
              ],
              volumeMounts: [
                {
                  name: 'i2c',
                  mountPath: '/dev/i2c-1'
                }
              ],
              ports: [
                {
                  name: 'metrics',
                  containerPort: METRICS_PORT
                }
              ]
            }
          ],
          volumes: [
            {
              name: 'i2c',
              hostPath: {
                path: '/dev/i2c-1',
                type: 'CharDevice'
              }
            }
          ]
        }
      }
    }
  })
];
