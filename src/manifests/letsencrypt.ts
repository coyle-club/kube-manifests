import { ClusterIssuer } from '@kubernetes-models/cert-manager/cert-manager.io/v1/ClusterIssuer';
import { Certificate } from '@kubernetes-models/cert-manager/cert-manager.io/v1/Certificate';

import { DOMAIN_NAME } from '../common/index';

export const name = 'letsencrypt';

const issuer = new ClusterIssuer({
  metadata: {
    name
  },
  spec: {
    acme: {
      email: 'letsencrypt@tpetr.net',
      server: 'https://acme-v02.api.letsencrypt.org/directory',
      privateKeySecretRef: {
        name: 'letsencrypt'
      },
      solvers: [
        {
          dns01: {
            cloudflare: {
              email: 'trpetr@gmail.com',
              apiTokenSecretRef: {
                name: 'cloudflare',
                key: 'cloudflare-api-token'
              }
            }
          }
        }
      ]
    }
  }
});

const issuerRef = {
  kind: issuer.kind,
  name
};

export const wildcardCert = (
  name: string,
  namespace: string,
  secretName: string
) =>
  new Certificate({
    metadata: {
      name,
      namespace
    },
    spec: {
      secretName,
      dnsNames: [`*.${DOMAIN_NAME}`, `*.${namespace}.svc.${DOMAIN_NAME}`],
      issuerRef
    }
  });

export const generate = () => [issuer];
