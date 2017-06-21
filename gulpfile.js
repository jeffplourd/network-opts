'use strict';
let gulp = require('gulp');
let runSequence = require('run-sequence');
let replace = require('gulp-replace-task');
let rename = require('gulp-rename');
let { $exec, gcloud, createPattern, kubeServiceName, gcluster, gclusterExists, extractMapping } = require('./gulp-utils');

const config = {
  version: process.env.CIRCLE_SHA1 || 'version',
  domain: 'us.gcr.io',
  serviceKey: process.env.GCLOUD_SERVICE_KEY,
  projectId: process.env.PROJECT_ID || 'projectId',
  clusterId: process.env.CLUSTER_ID || 'clusterId',
  zoneId: process.env.ZONE_ID || 'zoneId',
  user: process.env.USER,
  machineType: process.env.MACHINE_TYPE,
  diskSize: process.env.DISK_SIZE,
  network: process.env.NETWORK,
  numNodes: process.env.NUM_NODES,
  ports: extractMapping(process.env.PORT_MAPPING)
};

config.uri = `${config.domain}/${config.projectId}/`;
config.imageName = config.clusterId;
config.image = `${config.uri}${config.imageName}:${config.version}`;

gulp.task('gcloudUpdate', (cb) => {
  console.log('env variables: ', process.env);
  $exec(gcloud('--quiet components update'))
    .then(() => $exec(gcloud('--quiet components update kubectl')))
    .then(() => cb());
});

gulp.task('gcloudAuth', (cb) => {
  $exec(`echo ${config.serviceKey} | base64 --decode -i > ./gcloud-service-key.json`)
    .then(() => $exec(gcloud('auth activate-service-account --key-file ./gcloud-service-key.json')))
    .then(() => cb());
});

gulp.task('gcloudConfig', (cb) => {
  $exec(gcloud(`config set project ${config.projectId}`))
    .then(() => $exec(gcloud(`--quiet config set container/cluster ${config.clusterId}`)))
    .then(() => $exec(gcloud(`config set compute/zone ${config.zoneId}`)))
    .then(() => $exec(gcloud(`--quiet container clusters get-credentials ${config.clusterId}`)))
    .then(() => $exec(`sudo chown -R ${config.user} /home/ubuntu/.config`))
    .then(() => $exec('sudo chown -R ubuntu:ubuntu /home/ubuntu/.kube'))
    .then(() => cb());
});

gulp.task('dockerBuild', (cb) => {
  $exec(`docker build -t ${config.image} .`)
    .then(() => cb());
});

gulp.task('dockerPush', (cb) => {
  $exec(gcloud(`docker -- push ${config.image}`))
    .then(() => cb());
});

gulp.task('kubeCreateDeploymentConfig', () => {
  const name = `${config.clusterId}-depl`;
  const selector = `app: ${config.imageName}`;
  const imageName = config.imageName;
  const image = config.image;
  const ports = config.ports.map((port) => `- containerPort: ${port[0]}\n            protocol: "TCP"`).join('\n          ');

  const patterns = createPattern({
    name,
    selector,
    imageName,
    image,
    ports
  });

  gulp.src('./templates/kubernetes-deployment-template.yml')
    .pipe(replace({ patterns }))
    .pipe(rename('kubernetes-deployment.yml'))
    .pipe(gulp.dest('./templates'));
});

gulp.task('kubeDeployDeployment', (cb) => {
  $exec('kubectl apply -f ./templates/kubernetes-deployment.yml').then(() => cb());
});

gulp.task('kubeCreateServiceConfig', () => {
  const name = `${config.clusterId}-lb`;
  const selector = `app: ${config.imageName}`;
  const ports = config.ports.map((port) => `- port: ${port[0]}\n    targetPort: ${port[1]}`).join('\n  ');

  const patterns = createPattern({
    name,
    selector,
    ports
  });

  gulp.src('./templates/kubernetes-service-template.yml')
    .pipe(replace({ patterns }))
    .pipe(rename('kubernetes-service.yml'))
    .pipe(gulp.dest('./templates'));
});

gulp.task('kubeDeployService', (cb) => {
  kubeServiceName(config.imageName)
    .then((serviceName) => {
      if (serviceName === null) {
        return $exec('kubectl create -f ./templates/kubernetes-service.yml');
      }
      return Promise.resolve();
    })
    .then(() => cb());
});

gulp.task('gclusterCreate', (cb) => {
  gclusterExists(config.clusterId, config.zoneId, config.projectId).then((exists) => {
    if (exists) {
      $exec(gcloud(`
        container clusters create ${config.clusterId}
        --machine-type ${config.machineType}
        --disk-size ${config.diskSize}
        --network ${config.network}
        --num-nodes ${config.numNodes}
        --zone ${config.zoneId}
        --project ${config.projectId}
      `)).then(() => cb());
    }
    else {
      cb();
    }
  });
});

gulp.task('nginxDeploy', (cb) => {
  runSequence(
    'gcloudUpdate',
    'gcloudAuth',
    'gcloudConfig',
    'dockerBuild',
    'kubeCreateDeploymentConfig',
    'kubeDeployDeployment',
    'kubeCreateServiceConfig',
    'kubeDeployService',
    cb
  )
});
