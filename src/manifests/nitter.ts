import dedent from 'dedent-js';
import { Deployment } from 'kubernetes-models/apps/v1';
import { ConfigMap, Service } from 'kubernetes-models/v1';
import {
  HTTP_AND_HTTPS_CONTAINER_PORTS,
  HTTP_AND_HTTPS_PORTS,
  DOMAIN_NAME
} from '../common';
import { certificate } from './default';

const name = 'nitter';
const namespace = 'default';
const metadata = { name, namespace };
const labels = { app: name };

const NITTER_PORT = 8080;
const REDIS_PORT = 6379;

const sslPath = '/etc/nginx/ssl';

export const generate = () => [
  new ConfigMap({
    metadata,
    data: {
      'nitter.conf': dedent(`
                [Server]
                address = "localhost"
                port = ${NITTER_PORT}
                https = false  # disable to enable cookies when not using https
                httpMaxConnections = 100
                staticDir = "./public"
                title = "${name}"
                hostname = "${name}.${DOMAIN_NAME}"

                [Cache]
                listMinutes = 240  # how long to cache list info (not the tweets, so keep it high)
                rssMinutes = 10  # how long to cache rss queries
                redisHost = "localhost"  # Change to "nitter-redis" if using docker-compose
                redisPort = ${REDIS_PORT}
                redisPassword = ""
                redisConnections = 20  # connection pool size
                redisMaxConnections = 30
                # max, new connections are opened when none are available, but if the pool size
                # goes above this, they're closed when released. don't worry about this unless
                # you receive tons of requests per second

                [Config]
                hmacKey = "secretkey"  # random key for cryptographic signing of video urls
                base64Media = false  # use base64 encoding for proxied media urls
                enableRSS = true  # set this to false to disable RSS feeds
                enableDebug = false  # enable request logs and debug endpoints
                proxy = ""  # http/https url, SOCKS proxies are not supported
                proxyAuth = ""
                tokenCount = 10
                # minimum amount of usable tokens. tokens are used to authorize API requests,
                # but they expire after ~1 hour, and have a limit of 187 requests.
                # the limit gets reset every 15 minutes, and the pool is filled up so there's
                # always at least $tokenCount usable tokens. again, only increase this if
                # you receive major bursts all the time

                # Change default preferences here, see src/prefs_impl.nim for a complete list
                [Preferences]
                theme = "Nitter"
                replaceTwitter = "${name}.${DOMAIN_NAME}"
                replaceYouTube = ""
                replaceReddit = ""
                replaceInstagram = ""
                proxyVideos = true
                hlsPlayback = false
                infiniteScroll = false
            `),
      'nginx.conf': dedent(`
                server {
                    listen 80;
                    server_name *.${DOMAIN_NAME};

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

                    server_name *.${DOMAIN_NAME};

                    location / {
                        proxy_pass http://127.0.0.1:${NITTER_PORT}/;
                        proxy_http_version 1.1;
                        proxy_set_header Host $http_host;
                    }
                }`)
    }
  }),
  new Service({
    metadata,
    spec: {
      ports: HTTP_AND_HTTPS_PORTS,
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
          containers: [
            {
              name: 'nitter',
              image: 'zedeus/nitter:81ec41328d5684dd395f584254d723abee213ac0',
              env: [
                {
                  name: 'NITTER_CONF_FILE',
                  value: '/etc/nitter/nitter.conf'
                }
              ],
              ports: [
                {
                  name: 'nitter',
                  containerPort: NITTER_PORT
                }
              ],
              volumeMounts: [
                {
                  name: 'nitter-conf',
                  mountPath: '/etc/nitter'
                }
              ]
            },
            {
              name: 'redis',
              image: 'redis:7.0.2',
              ports: [
                {
                  name: 'redis',
                  containerPort: REDIS_PORT
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
              name: 'nitter-conf',
              configMap: {
                name,
                items: [
                  {
                    key: 'nitter.conf',
                    path: 'nitter.conf'
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
      }
    }
  })
];
