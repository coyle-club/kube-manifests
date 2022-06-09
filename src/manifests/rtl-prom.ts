import { Deployment } from 'kubernetes-models/apps/v1';
import { ConfigMap, Service } from 'kubernetes-models/v1';

const name = 'rtl-prom';
const namespace = 'monitoring';
const metadata = { name, namespace };
const labels = { app: name };

const METRICS_PORT = 8080;

export const generate = () => [
  new ConfigMap({
    metadata,
    data: {
      'config.json': JSON.stringify([
        {
          match: {
            model: 'ERT-SCM',
            id: '42243013'
          },
          value_fields: ['consumption_data', 'timestamp'],
          label_fields: ['model', 'id', 'ert_type'],
          description: 'Electric consumption',
          metric_name: 'electric'
        },
        {
          match: {
            model: 'ERT-SCM',
            id: '44471729'
          },
          value_fields: ['consumption_data', 'timestamp'],
          label_fields: ['model', 'id', 'ert_type'],
          description: 'Gas consumption',
          metric_name: 'gas'
        },
        {
          match: {
            model: 'Fineoffset-WH51'
          },
          value_fields: ['battery_mV', 'moisture', 'timestamp'],
          label_fields: ['model', 'id'],
          metric_name: 'moisture',
          description: 'Moisture sensor'
        }
      ])
    }
  }),
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
            'kubernetes.io/hostname': 'arepo' // rtl-sdr is plugged into arepo
          },
          containers: [
            {
              name: 'rtl-prom',
              image: 'docker.coyle.club/internal/rtl_prom:1',
              args: [
                '--port',
                String(METRICS_PORT),
                '/etc/rtl_prom/config.json',
                '/var/log/rtl_433/rtl_433.json'
              ],
              volumeMounts: [
                {
                  name: 'conf',
                  mountPath: '/etc/rtl_prom'
                },
                {
                  name: 'logs',
                  mountPath: '/var/log/rtl_433'
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
              name: 'conf',
              configMap: {
                name
              }
            },
            {
              name: 'logs',
              hostPath: {
                path: '/var/log/rtl_433',
                type: 'Directory'
              }
            }
          ]
        }
      }
    }
  })
];
