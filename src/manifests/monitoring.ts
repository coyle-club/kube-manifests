import { Namespace } from 'kubernetes-models/v1';
import { wildcardCert } from './letsencrypt';

const namespace = 'monitoring';

export const certificate = wildcardCert(
  'coyle-wildcard',
  namespace,
  'coyle-wildcard'
);

export const generate = () => [
  new Namespace({
    metadata: {
      name: namespace
    }
  }),
  certificate
];
