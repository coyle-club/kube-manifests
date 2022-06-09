import { Namespace } from 'kubernetes-models/v1';
import { wildcardCert } from './letsencrypt';

const name = 'default';

export const certificate = wildcardCert(
  'coyle-wildcard',
  name,
  'coyle-wildcard'
);

export const generate = () => [
  new Namespace({
    metadata: { name }
  }),
  certificate
];
