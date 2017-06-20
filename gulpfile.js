'use strict';
let gulp = require('gulp');
let { $exec, gcloud, createPattern, kubeServiceName } = require('./gulp-utils');
let runSequence = require('run-sequence');
let replace = require('gulp-replace-task');
let rename = require('gulp-rename');

const config = {
  version: process.env.CIRCLE_SHA1,
  domain: 'us.gcr.io',
  serviceKey: process.env.GCLOUD_SERVICE_KEY,
  projectId: process.env.PROJECT_ID,
  clusterId: process.env.CLUSTER_ID,
  zoneId: process.env.ZONE_ID,
  user: process.env.USER,
};

config.uri = `${config.domain}/${config.projectId}/`;
config.imageName = config.clusterId;
config.image = `${config.uri}${config.imageName}:${config.version}`;

gulp.task('gcloudUpdate', (cb) => {
  $exec(gcloud('--quiet components update'))
    .then(() => gcloud('--quiet components update kubectl'))
    .then(() => cb());
});

gulp.task('gcloudAuth', (cb) => {
  $exec(`echo ${config.serviceKey} | base64 --decode -i > ./gcloud-service-key.json`)
    .then(() => gcloud('auth activate-service-account --key-file ./gcloud-service-key.json'))
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
  const patterns = createPattern({});
  gulp.src('./templates/kubernetes-deployment-template.yml')
    .pipe(replace({ patterns }))
    .pipe(rename('kubernetes-deployment.yml'))
    .pipe(gulp.dest('./templates'));
});

gulp.task('kubeDeployDeployment', (cb) => {
  $exec('kubectl apply -f ./templates/kubernetes-deployment.yml').then(() => cb());
});

gulp.task('kubeCreateServiceConfig', () => {
  const patterns = createPattern({});
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
